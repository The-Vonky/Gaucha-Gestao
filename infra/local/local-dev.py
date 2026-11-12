#!/usr/bin/env python3
"""Provisionamento e cópia a frio do Compose DEV local."""
import argparse
import base64
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PROJECT = "gaucha-gestao-local"
VOLUMES = {"db-data": "pgdata", "storage-data": "objects", "studio-snippets": "snippets"}
DB_IMAGE = ("public.ecr.aws/supabase/postgres@"
            "sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb")
LEDGER = "supabase_migrations.schema_migrations"
COMPOSE_SECRETS = {
    "POSTGRES_PASSWORD", "JWT_SECRET", "ANON_KEY", "SERVICE_ROLE_KEY", "GOTRUE_JWT_KEYS",
    "PGRST_JWT_SECRET", "JWT_JWKS", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY",
    "S3_ACCESS_KEY_ID", "S3_ACCESS_KEY_SECRET",
}


def run(*command, **options):
    return subprocess.run(command, check=True, **options)


def private_file(path, content):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        stream.write(content)


def jwt(secret, role):
    def encode(value):
        return base64.urlsafe_b64encode(value).rstrip(b"=").decode()
    claims = {"role": role, "iss": "supabase", "iat": int(time.time()),
              "exp": int(time.time()) + 5 * 365 * 86400}
    body = encode(b'{"alg":"HS256","typ":"JWT"}') + "." + encode(json.dumps(claims).encode())
    return body + "." + encode(hmac.digest(secret.encode(), body.encode(), "sha256"))


def generate(path, ports):
    if len(set(ports)) != 3 or any(not 1024 <= port <= 65535 for port in ports):
        raise SystemExit("Informe três portas distintas entre 1024 e 65535.")
    secret = secrets.token_hex(48)
    values = dict(zip(("GG_API_PORT", "GG_DB_PORT", "GG_STUDIO_PORT"), ports))
    values.update(POSTGRES_PASSWORD=secrets.token_hex(32), JWT_SECRET=secret,
                  ANON_KEY=jwt(secret, "anon"), SERVICE_ROLE_KEY=jwt(secret, "service_role"),
                  S3_ACCESS_KEY_ID=secrets.token_hex(16), S3_ACCESS_KEY_SECRET=secrets.token_hex(32))
    private_file(path, "".join(f"{key}={value}\n" for key, value in values.items()).encode())


def compose_args(path, project):
    return ("docker", "compose", "-f", str(HERE / "compose.yaml"),
            "--env-file", str(path), "--project-name", project)


def private_values(path):
    if not path.is_file() or path.stat().st_mode & 0o077:
        raise SystemExit("Use um arquivo de segredos privado (chmod 600).")
    values = {}
    for line in path.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or key in values:
            raise SystemExit("Formato do arquivo de segredos inválido.")
        values[key] = value.removeprefix("'").removesuffix("'")
    return values


def compose(path, project, *args, **options):
    # Compose gives shell variables precedence over --env-file.
    env = {key: value for key, value in os.environ.items()
           if key not in COMPOSE_SECRETS and not key.startswith(("COMPOSE_", "GG_"))}
    return run(*compose_args(path, project), *args, env=env, **options)


def sql(path, project, query):
    result = compose(path, project, "exec", "-T", "db", "psql", "-X", "-qAt",
                     "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
                     input="set client_min_messages = error;\n" + query,
                     text=True, stdout=subprocess.PIPE)
    return result.stdout.strip()


def migrations():
    return sorted((ROOT / "supabase/migrations").glob("*.sql"))


def apply(path, project):
    files = migrations()
    names = [file.stem.split("_", 1) for file in files]
    if not files or any(not re.fullmatch(r"[0-9]+", version) or
                        not re.fullmatch(r"[a-zA-Z0-9_]+", name) for version, name in names):
        raise SystemExit("Migrations ausentes ou com nomes inválidos.")
    if len({version for version, _ in names}) != len(names):
        raise SystemExit("Versões de migrations duplicadas.")
    # Prepare every transaction before touching the target ledger.
    batches = []
    for file, (version, name) in zip(files, names):
        source = file.read_text()
        if re.findall(r"(?im)^\s*(begin|commit|rollback)\s*;", source.lower()) != ["begin", "commit"]:
            raise SystemExit(f"Revise a transação da migration {file.name}.")
        terminal = re.search(r"(?im)^commit;\s*\Z", source)
        if not terminal:
            raise SystemExit(f"COMMIT terminal ausente na migration {file.name}.")
        entry = f"insert into {LEDGER}(version, name) values ('{version}', '{name}');\n"
        batches.append(source[:terminal.start()] + entry + source[terminal.start():])
    sql(path, project, f"""
      begin;
      do $$ begin
        if to_regnamespace('core') is not null and to_regclass('{LEDGER}') is null then
          raise exception 'Banco com aplicação e sem ledger';
        end if;
      end $$;
      create schema if not exists supabase_migrations;
      create table if not exists {LEDGER}(version text primary key, statements text[], name text);
      revoke all on schema supabase_migrations from public;
      revoke all on {LEDGER} from public;
      commit;
    """)
    applied = sql(path, project, f"select version from {LEDGER} order by version;").splitlines()
    if applied != [version for version, _ in names[:len(applied)]]:
        raise SystemExit("Ledger não é um prefixo do checkout. Confira a origem antes de prosseguir.")
    for file, batch in zip(files[len(applied):], batches[len(applied):]):
        try:
            sql(path, project, batch)
        except subprocess.CalledProcessError:
            raise SystemExit(f"Falha na migration {file.name}.") from None
    sql(path, project, "notify pgrst, 'reload schema';")
    print(f"Ledger do DEV conferido: {len(files)} migrations.")


def cli_containers():
    def ids(filter_value):
        return run("docker", "ps", "-aq", "--filter", filter_value,
                   capture_output=True, text=True).stdout.splitlines()
    return ids(f"label=com.supabase.cli.project={PROJECT}") + ids(f"name=^/{PROJECT}-audit-imgproxy$")


def inspect(*containers):
    return json.loads(run("docker", "inspect", *containers, capture_output=True, text=True).stdout)


def stopped_cli():
    containers = cli_containers()
    if not containers or any(item["State"]["Status"] != "exited" for item in inspect(*containers)):
        raise SystemExit("A migração exige todos os containers de origem parados.")


def cli_service(service):
    item, = inspect(f"supabase_{service}_{PROJECT}")
    if item["Config"]["Labels"].get("com.supabase.cli.project") != PROJECT:
        raise SystemExit("O container não pertence à origem Supabase CLI esperada.")
    return item


def capture_cli_secrets(path):
    def environment(service):
        return dict(entry.split("=", 1) for entry in cli_service(service)["Config"]["Env"])
    db, auth, rest, storage, studio = map(environment, ("db", "auth", "rest", "storage", "studio"))
    password = db["POSTGRES_PASSWORD"]
    if not re.fullmatch(r"[A-Za-z0-9._~-]+", password):
        raise SystemExit("A senha de origem exige tratamento de escape na URI PostgreSQL.")
    if auth["GOTRUE_JWT_SECRET"] != storage["AUTH_JWT_SECRET"]:
        raise SystemExit("Auth e Storage de origem usam material JWT diferente.")
    if (storage["TENANT_ID"], storage["GLOBAL_S3_BUCKET"], storage["FILE_STORAGE_BACKEND_PATH"]) != (
        "stub", "stub", "/mnt"
    ):
        raise SystemExit("O layout Storage de origem difere do Compose.")
    values = {
        "GG_API_PORT": "54321", "GG_DB_PORT": "54322", "GG_STUDIO_PORT": "54323",
        "POSTGRES_PASSWORD": password, "JWT_SECRET": auth["GOTRUE_JWT_SECRET"],
        "GOTRUE_JWT_KEYS": auth.get("GOTRUE_JWT_KEYS", ""),
        "PGRST_JWT_SECRET": rest["PGRST_JWT_SECRET"], "JWT_JWKS": storage.get("JWT_JWKS", ""),
        "ANON_KEY": storage["ANON_KEY"], "SERVICE_ROLE_KEY": storage["SERVICE_KEY"],
        "SUPABASE_PUBLISHABLE_KEY": studio.get("SUPABASE_PUBLISHABLE_KEY", ""),
        "SUPABASE_SECRET_KEY": studio.get("SUPABASE_SECRET_KEY", ""),
        "S3_ACCESS_KEY_ID": storage["S3_PROTOCOL_ACCESS_KEY_ID"],
        "S3_ACCESS_KEY_SECRET": storage["S3_PROTOCOL_ACCESS_KEY_SECRET"],
    }
    if any(re.search(r"['\\\r\n]", value) for value in values.values()):
        raise SystemExit("Material de origem não representável no formato dotenv esperado.")
    private_file(path, "".join(f"{key}='{value}'\n" for key, value in values.items()).encode())


def install(path, project):
    if project == PROJECT and cli_containers():
        raise SystemExit("Instância da Supabase CLI encontrada. Use o procedimento de migração.")
    compose(path, project, "up", "-d", "--wait", "--wait-timeout", "160", "db", "auth", "storage")
    apply(path, project)
    compose(path, project, "up", "-d", "--wait", "--wait-timeout", "160")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def volume_tar(volume, *tar_args, **options):
    read_only = tar_args[0] != "-xpf"
    mount = f"type=volume,src={volume},dst=/data" + (",readonly" if read_only else "")
    return run("docker", "run", "--rm", "-i", "--pull=never", "--network=none", "--user=0:0",
               "--entrypoint", "tar", "--mount", mount, DB_IMAGE, *tar_args, **options)


def capture_volume(volume, target):
    with target.open("xb") as stream:
        volume_tar(volume, "-cpf", "-", "-C", "/data", ".", stdout=stream)


def manifest(folder):
    names = {"pgdata.tar", "objects.tar", "snippets.tar", "secrets.env", "database.dump", "roles.sql"}
    files = {name: digest(folder / name) for name in sorted(names)}
    payload = {"postgres_image": DB_IMAGE, "files": files}
    private_file(folder / "manifest.json", (json.dumps(payload, indent=2) + "\n").encode())


def capture_cli(path, folder):
    stopped_cli()
    if folder.stat().st_mode & 0o077:
        raise SystemExit("Use uma pasta privada (chmod 700).")
    for name in ("database.dump", "roles.sql"):
        if not (folder / name).is_file() or not (folder / name).stat().st_size:
            raise SystemExit("Capture o dump e os roles antes de parar o PostgreSQL.")
    for service, destination, archive in (
        ("db", "/var/lib/postgresql/data", "pgdata"), ("storage", "/mnt", "objects")
    ):
        item = cli_service(service)
        volume = f"supabase_{service}_{PROJECT}"
        if not any(mount.get("Name") == volume and mount["Destination"] == destination
                   for mount in item["Mounts"]):
            raise SystemExit("Volume de origem não corresponde ao inventário.")
        if service == "db":
            expected = run("docker", "image", "inspect", "--format", "{{.Id}}", DB_IMAGE,
                           capture_output=True, text=True).stdout.strip()
            if item["Image"] != expected:
                raise SystemExit("A imagem PostgreSQL de origem difere do digest fixado.")
        capture_volume(volume, folder / f"{archive}.tar")
    snippets = [mount["Source"] for mount in cli_service("studio")["Mounts"]
                if mount["Type"] == "bind" and mount["Destination"].endswith("/supabase/snippets")]
    if len(snippets) != 1 or not Path(snippets[0]).is_dir():
        raise SystemExit("O bind de snippets da origem não foi encontrado.")
    with (folder / "snippets.tar").open("xb") as stream:
        run("tar", "-cpf", "-", "-C", snippets[0], ".", stdout=stream)
    private_file(folder / "secrets.env", path.read_bytes())
    manifest(folder)
    verify_archive(folder)


def list_volumes(project):
    return run("docker", "volume", "ls", "-q", "--filter", f"label=com.docker.compose.project={project}",
               capture_output=True, text=True).stdout.splitlines()


def expected_volumes(project):
    return {f"{project}_{name}" for name in VOLUMES}


def require_owned_volumes(project):
    volumes = set(list_volumes(project))
    if not expected_volumes(project).issubset(volumes):
        raise SystemExit("Volumes esperados do Compose ausentes.")


def backup(path, project, folder):
    require_owned_volumes(project)
    running = compose(path, project, "ps", "--services", "--status", "running",
                      capture_output=True, text=True).stdout.splitlines()
    if len(running) != 8:
        raise SystemExit("Inicie os oito serviços antes de capturar um backup consistente.")
    folder.mkdir(mode=0o700)
    private_file(folder / "secrets.env", path.read_bytes())
    # Stop all writers first. The database stays online only to collect the logical fallback.
    try:
        compose(path, project, "stop", "kong", "studio", "rest", "pg-meta", "auth", "storage", "imgproxy")
        for name, command in {
            "database.dump": ("pg_dump", "-Fc", "-U", "supabase_admin", "postgres"),
            "roles.sql": ("pg_dumpall", "--globals-only", "-U", "supabase_admin"),
        }.items():
            with (folder / name).open("xb") as stream:
                compose(path, project, "exec", "-T", "db", *command, stdout=stream)
        compose(path, project, "stop", "-t", "60", "db")
        for volume, archive in VOLUMES.items():
            capture_volume(f"{project}_{volume}", folder / f"{archive}.tar")
        manifest(folder)
        verify_archive(folder)
    finally:
        compose(path, project, "start")


def verify_archive(folder):
    expected = {f"{archive}.tar" for archive in VOLUMES.values()}
    expected.update({"secrets.env", "database.dump", "roles.sql"})
    payload = json.loads((folder / "manifest.json").read_text())
    files = payload.get("files", {})
    if (payload.get("postgres_image") != DB_IMAGE or set(files) != expected
        or any(digest(folder / name) != files[name] for name in expected)):
        raise SystemExit("Backup incompleto ou com SHA-256 divergente.")
    result = run("tar", "-xOf", folder / "pgdata.tar", "./PG_VERSION", capture_output=True, text=True)
    if result.stdout.strip() != "17":
        raise SystemExit("Backup fora da versão PostgreSQL 17.")
    result = run("tar", "-tf", folder / "pgdata.tar", capture_output=True, text=True)
    if "./postmaster.pid" in result.stdout.splitlines():
        raise SystemExit("Backup PostgreSQL não foi capturado a frio.")


def restore(path, project, folder, adopt_cli=False):
    verify_archive(folder)
    if adopt_cli:
        if project != PROJECT:
            raise SystemExit("A adoção usa o nome definitivo do Compose.")
        stopped_cli()
    elif project == PROJECT and cli_containers():
        raise SystemExit("Use uma restauração isolada ou siga a janela de adoção autorizada.")
    containers = compose(path, project, "ps", "-aq", capture_output=True, text=True).stdout.strip()
    volumes = run("docker", "volume", "ls", "-q", capture_output=True, text=True).stdout.splitlines()
    if containers or expected_volumes(project).intersection(volumes):
        raise SystemExit("A restauração exige um projeto novo e sem volumes.")
    # Preserve all credentials. Only host port mappings can change for an isolated restore.
    before = private_values(folder / "secrets.env")
    after = private_values(path)
    for key in ("GG_API_PORT", "GG_DB_PORT", "GG_STUDIO_PORT"):
        before.pop(key, None)
        after.pop(key, None)
    if before != after:
        raise SystemExit("O arquivo de segredos não corresponde ao backup.")
    compose(path, project, "create")
    require_owned_volumes(project)
    for volume, archive in VOLUMES.items():
        with (folder / f"{archive}.tar").open("rb") as stream:
            volume_tar(f"{project}_{volume}", "-xpf", "-", "--numeric-owner", "-C", "/data", stdin=stream)
    compose(path, project, "up", "-d", "--wait", "--wait-timeout", "160")


def write_vite(path, target):
    values = private_values(path)
    key = values.get("SUPABASE_PUBLISHABLE_KEY") or values["ANON_KEY"]
    port = values.get("GG_API_PORT", "54321")
    if not port.isdecimal() or not re.fullmatch(r"[A-Za-z0-9_.-]+", key):
        raise SystemExit("Porta ou chave pública inválida.")
    private_file(target, (f"VITE_SUPABASE_URL=http://127.0.0.1:{port}\n"
                          f"VITE_SUPABASE_PUBLISHABLE_KEY={key}\n"
                          "VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS=true\n").encode())


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--project", default=PROJECT)
    commands = parser.add_subparsers(dest="command", required=True)
    gen = commands.add_parser("secrets")
    gen.add_argument("--ports", type=int, nargs=3, default=[54321, 54322, 54323])
    commands.add_parser("install")
    commands.add_parser("cli-secrets")
    vite = commands.add_parser("vite-env")
    vite.add_argument("--output", type=Path, default=ROOT / "apps/web/.env.local")
    commands.add_parser("backup").add_argument("folder", type=Path)
    commands.add_parser("capture-stopped-cli").add_argument("folder", type=Path)
    restore_command = commands.add_parser("restore")
    restore_command.add_argument("folder", type=Path)
    restore_command.add_argument("--adopt-stopped-cli", action="store_true")
    args = parser.parse_args()
    path = args.env_file.resolve()
    if args.project != PROJECT and not re.fullmatch(r"gg-dev-lab-[a-z0-9-]+", args.project):
        parser.error("Projeto deve ser gaucha-gestao-local ou gg-dev-lab-<identificador>.")
    if args.command in ("secrets", "cli-secrets"):
        if path.is_relative_to(ROOT) and not path.name.startswith(".env."):
            parser.error("Use um caminho privado externo ou um nome ignorado .env.*.")
        if args.command == "secrets":
            generate(path, args.ports)
        elif args.project == PROJECT:
            capture_cli_secrets(path)
        else:
            parser.error("A origem Supabase CLI usa o nome definitivo.")
        return
    private_values(path)
    if args.command == "vite-env":
        write_vite(path, args.output)
        return
    # Serialize provisioning and cold snapshots for a local operator.
    lock = Path(f"/tmp/gg-compose-{os.getuid()}-{args.project}.lock")
    with os.fdopen(os.open(lock, os.O_CREAT | os.O_WRONLY | os.O_NOFOLLOW, 0o600), "w") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.command == "install":
            install(path, args.project)
        else:
            if args.folder.resolve().is_relative_to(ROOT):
                parser.error("Mantenha o backup fora do checkout.")
            folder = args.folder.resolve()
            if args.command == "backup":
                backup(path, args.project, folder)
            elif args.command == "restore":
                restore(path, args.project, folder, args.adopt_stopped_cli)
            elif args.project == PROJECT:
                capture_cli(path, folder)
            else:
                parser.error("A origem Supabase CLI usa o nome definitivo.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.CalledProcessError) as error:
        # Never print command arguments, environment or contents of the private package.
        raise SystemExit(f"Operação interrompida ({type(error).__name__}).") from None
