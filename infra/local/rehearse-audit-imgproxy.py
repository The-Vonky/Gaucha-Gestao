#!/usr/bin/env python3
"""Ensaia ativação e reversão com serviços e dados sintéticos exclusivos."""

import base64
import hashlib
import hmac
import importlib
import io
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import struct
import sys
import tarfile
import tempfile
import time
import zlib

import yaml

ops = importlib.import_module("prepare-audit-imgproxy")
POSTGRES = "public.ecr.aws/supabase/postgres:17.6.1.167"
AUTH = "public.ecr.aws/supabase/gotrue:v2.196.0"
REST = "public.ecr.aws/supabase/postgrest:v16.2"

NGINX_COMMAND = """cat <<'EOF' > /home/kong/custom_nginx.template && exec ./docker-entrypoint.sh kong docker-start --nginx-conf /home/kong/custom_nginx.template
pid pids/nginx.pid;
error_log logs/error.log ${{LOG_LEVEL}};
daemon ${{NGINX_DAEMON}};
worker_processes ${{NGINX_WORKER_PROCESSES}};
events { multi_accept on; }
http {
    server {
        server_name email_templates;
        listen 0.0.0.0:8088 reuseport backlog=16384;
        access_log logs/email_templates_access.log;
        error_log logs/error.log notice;
        location /email { autoindex on; root /home/kong/templates; }
    }
    include 'nginx-kong.conf';
}
EOF
"""


def jwt(secret, role):
    def b64(data):
        return base64.urlsafe_b64encode(data).rstrip(b"=")

    header = b64(b'{"alg":"HS256","typ":"JWT"}')
    claims = b64(json.dumps({"role": role, "exp": int(time.time()) + 3600}).encode())
    body = header + b"." + claims
    signature = hmac.digest(secret.encode(), body, "sha256")
    return (body + b"." + b64(signature)).decode()


def png():
    def chunk(kind, payload):
        return (struct.pack(">I", len(payload)) + kind + payload +
                struct.pack(">I", zlib.crc32(kind + payload)))

    width, height = 640, 512
    row = b"\0" + bytes(x % 256 for x in range(width * 3))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(row * height)) + chunk(b"IEND", b""))


def run_service(target, folder, role, image, env, *options, start=True, args=()):
    envfile = folder / f"{role}.env"
    envfile.write_text("".join(f"{key}={value}\n" for key, value in env.items()))
    name = target.service(role)
    ops.docker("run" if start else "create", *(("--detach",) if start else ()),
               "--pull=never", "--name", name, "--label", f"{ops.LABEL}={target.project}",
               "--label", f"com.supabase.cli.project={target.project}", "--network", target.network,
               "--network-alias", role, "--env-file", str(envfile), *options, image, *args)
    envfile.unlink()
    return name


def seed_kong(target, folder):
    ops.command("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                "-subj", "/CN=localhost", "-keyout", str(folder / "localhost.key"),
                "-out", str(folder / "localhost.crt"))
    def service(name, host, port, prefix, upstream=""):
        return {"name": name, "url": f"http://{target.service(host)}:{port}/{upstream}",
                "routes": [{"name": f"{name}-all", "paths": [f"/{prefix}/"], "strip_path": True}],
                "plugins": [{"name": "cors"}, {"name": "request-transformer"}]}

    declarative = {"_format_version": "1.1", "services": [
        service("auth-v1", "auth", 9999, "auth/v1"), service("rest-v1", "rest", 3000, "rest/v1"),
        service("storage-v1", "storage", 5000, "storage/v1"),
        service("storage-v1-s3", "storage", 5000, "storage/v1/s3", "s3"),
    ]}
    (folder / "kong.yml").write_text(yaml.safe_dump(declarative, sort_keys=False))
    kong = run_service(target, folder, "kong", ops.KONG_IMAGE, {
        "KONG_DATABASE": "off", "KONG_DECLARATIVE_CONFIG": "/home/kong/kong.yml",
        "KONG_PLUGINS": "request-transformer,cors", "KONG_NGINX_WORKER_PROCESSES": "1",
        "KONG_SSL_CERT": "/home/kong/localhost.crt", "KONG_SSL_CERT_KEY": "/home/kong/localhost.key",
        "KONG_DNS_ORDER": "LAST,A,CNAME", "KONG_DNS_VALID_TTL": "1", "KONG_DNS_NOT_FOUND_TTL": "1",
    }, "--publish", f"{target.port}:8000", "--network-alias", "api.supabase.internal",
        "--health-cmd", "kong health", "--health-interval", "2s", "--health-retries", "10",
        "--entrypoint", "sh", start=False, args=("-c", NGINX_COMMAND))
    container_id = ops.inspect(kong)["Id"]
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w") as files:
        for name in ops.KONG_FILES:
            payload = (folder / name).read_bytes()
            entry = tarfile.TarInfo(name)
            entry.uid, entry.gid = 100, 65533
            entry.size = len(payload)
            entry.mode = 0o600 if name.endswith(".key") else 0o644
            files.addfile(entry, io.BytesIO(payload))
    ops.engine(f"/containers/{container_id}/archive?path={ops.KONG_DIR}&copyUIDGID=false",
               "PUT", archive.getvalue(), "application/x-tar")
    ops.docker("start", kong)
    ops.wait_health(container_id, "Kong anterior")


def psql(db, sql):
    ops.docker("exec", "-i", db, "psql", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
               data=sql.encode())


def bootstrap(target, folder):
    password, secret = secrets.token_hex(24), secrets.token_hex(32)
    anon, service = jwt(secret, "anon"), jwt(secret, "service_role")
    db = run_service(target, folder, "db", POSTGRES, {"POSTGRES_PASSWORD": password},
                     "--tmpfs", "/var/lib/postgresql/data:rw,size=256m", "--shm-size=64m",
                     "--health-cmd", "pg_isready -h 127.0.0.1 -U supabase_admin -d postgres",
                     "--health-interval", "2s", "--health-retries", "20")
    ops.wait_health(db, "PostgreSQL sintético")
    psql(db, "\n".join(f"ALTER ROLE {role} PASSWORD '{password}';" for role in
                       ("supabase_storage_admin", "supabase_auth_admin", "authenticator")))

    def db_url(role):
        return f"postgresql://{role}:{password}@db:5432/postgres"

    auth = run_service(target, folder, "auth", AUTH, {
        "GOTRUE_API_HOST": "0.0.0.0", "GOTRUE_API_PORT": "9999",
        "API_EXTERNAL_URL": f"http://127.0.0.1:{target.port}/auth/v1",
        "GOTRUE_SITE_URL": f"http://127.0.0.1:{target.port}",
        "GOTRUE_DB_DRIVER": "postgres", "GOTRUE_DB_DATABASE_URL": db_url("supabase_auth_admin"),
        "GOTRUE_JWT_SECRET": secret, "GOTRUE_JWT_ADMIN_ROLES": "service_role",
        "GOTRUE_JWT_DEFAULT_GROUP_NAME": "authenticated", "GOTRUE_JWT_AUD": "authenticated",
        "GOTRUE_EXTERNAL_EMAIL_ENABLED": "true", "GOTRUE_MAILER_AUTOCONFIRM": "true",
    }, "--health-cmd", "wget -q --spider http://127.0.0.1:9999/health", "--health-interval", "2s",
        "--health-retries", "20")
    ops.wait_health(auth, "Auth sintético")
    psql(db, """CREATE TABLE public.imgproxy_proof (id int PRIMARY KEY);
INSERT INTO public.imgproxy_proof VALUES (1);
GRANT SELECT ON public.imgproxy_proof TO authenticated;""")
    run_service(target, folder, "rest", REST, {
        "PGRST_DB_URI": db_url("authenticator"), "PGRST_DB_SCHEMAS": "public",
        "PGRST_DB_ANON_ROLE": "anon", "PGRST_JWT_SECRET": secret,
    })
    storage = run_service(target, folder, "storage", ops.STORAGE_IMAGE, {
        "AUTH_JWT_SECRET": secret, "ANON_KEY": anon, "SERVICE_KEY": service,
        "DATABASE_URL": db_url("supabase_storage_admin"), "DB_INSTALL_ROLES": "false",
        "STORAGE_BACKEND": "file", "FILE_STORAGE_BACKEND_PATH": "/mnt",
        "GLOBAL_S3_BUCKET": "imgproxy-proof", "TENANT_ID": target.project, "REGION": "local",
        "S3_PROTOCOL_ENABLED": "true", "FILE_SIZE_LIMIT": "10485760",
        "ENABLE_IMAGE_TRANSFORMATION": "false", "IMAGE_TRANSFORMATION_ENABLED": "false",
    }, "--volume", f"{target.service('storage')}:/mnt",
        "--health-cmd", "wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/status",
        "--health-interval", "2s", "--health-retries", "20")
    ops.wait_health(storage, "Storage anterior")
    seed_kong(target, folder)

    bucket = "audit-checklist-evidence"
    email = "audit-imgproxy@example.invalid"
    auth_password = secrets.token_hex(18)
    _, payload = ops.expect(ops.http(target, "POST", "/auth/v1/admin/users", key=service, token=service,
                                     body={"email": email, "password": auth_password, "email_confirm": True}),
                            200, "Conta sintética")
    user = json.loads(payload)["id"]
    psql(db, f"""CREATE POLICY proof_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('{bucket}', 'other-private') AND split_part(name, '/', 1) = (SELECT auth.uid())::text);
CREATE POLICY proof_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('{bucket}', 'other-private') AND split_part(name, '/', 1) = (SELECT auth.uid())::text);""")
    fixture = {"email": email, "password": auth_password, "apikey": anon,
               "object": f"{bucket}/{user}/fixture.png", "rest_path": "/rest/v1/imgproxy_proof?select=id"}
    other = {**fixture, "object": f"other-private/{user}/fixture.png"}
    image = png()
    token = ops.login(target, fixture)
    claims = token.split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(claims + "=" * (-len(claims) % 4)))
    ops.require(claims["role"] == "authenticated" and claims["sub"] == user, "Claims de Auth sintético inesperadas.")
    for item in (fixture, other):
        name = item["object"].split("/")[0]
        ops.expect(ops.http(target, "POST", "/storage/v1/bucket", key=service, token=service,
                            body={"id": name, "name": name, "public": False}), 200, "Bucket privado")
        ops.expect(ops.http(target, "POST", f"/storage/v1/object/{item['object']}", key=anon, token=token,
                            body=image, content_type="image/png"), 200, "Upload autorizado")
    return fixture, other, hashlib.sha256(image).hexdigest()


def container_fingerprint():
    ids = ops.docker("ps", "-q", "--no-trunc").decode().splitlines()
    return {container_id: ops.inspect(container_id)["State"]["StartedAt"] for container_id in ids}


def rehearsal(target, folder):
    fixture, other, digest = bootstrap(target, folder)
    token = ops.login(target, fixture)

    def verify_other():
        ops.require(hashlib.sha256(ops.original(target, other, token)[1]).hexdigest() == digest,
                    "Original do segundo bucket mudou.")
        path = f"/storage/v1/object/authenticated/{other['object']}"
        ops.require(ops.http(target, "GET", path)[0] in (400, 401, 403, 404),
                    "Segundo bucket privado acessível anonimamente.")

    s3 = "/storage/v1/s3/"
    status, headers, _ = ops.http(target, "GET", s3)
    s3_baseline = status, headers.get_all("Cache-Control"), headers.get_all("Expires")

    def verify_s3():
        status, headers, _ = ops.http(target, "GET", s3)
        ops.require((status, headers.get_all("Cache-Control"), headers.get_all("Expires")) == s3_baseline,
                    "Rota S3 mudou de status ou política de cache.")

    verify_other()
    ops.activate(target, folder, fixture)
    state = json.loads((folder / "state.json").read_text())
    ops.require(state["digest"] == digest, "Original do ensaio difere do upload.")
    verify_other()
    verify_s3()
    ops.rollback(target, folder, fixture)
    (folder / "state.json").unlink()
    verify_other()
    try:
        ops.activate(target, folder, fixture, inject_failure=True)
    except ops.InjectedFailure as error:
        print(error, flush=True)
    else:
        raise ops.OperationError("Falha de ativação não foi simulada.")
    ops.require(not (folder / "state.json").exists(), "Reversão automática não foi confirmada.")
    verify_other()
    verify_s3()
    ops.require([ops.inspect(name)["Id"] for name in target.services] == state["originals"],
                "IDs anteriores diferentes ao fim do ensaio.")


def main():
    ops.require(shutil.which("openssl"), "OpenSSL obrigatório no ensaio.")
    ops.verify_tools()
    for image in (POSTGRES, AUTH, REST):
        ops.require(ops.docker("image", "inspect", image, allow_failure=True) is not None, f"Imagem ausente: {image}.")
    baseline = container_fingerprint()
    project = f"gg-aud-imgproof-{secrets.token_hex(6)}"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        target = ops.Target(project, listener.getsockname()[1])
    volume = target.service("storage")
    ops.require(ops.docker("network", "inspect", target.network, allow_failure=True) is None and
                ops.docker("volume", "inspect", volume, allow_failure=True) is None,
                "Colisão com recurso Docker existente.")
    with tempfile.TemporaryDirectory(prefix=project + "-") as tmp:
        ops.docker("network", "create", "--label", f"{ops.LABEL}={project}",
                   "--opt", "com.docker.network.bridge.host_binding_ipv4=127.0.0.1", target.network)
        try:
            ops.docker("volume", "create", "--label", f"{ops.LABEL}={project}", volume)
            rehearsal(target, Path(tmp))
        finally:
            # Remover só os recursos do projeto sintético, começando pelo sidecar.
            proxy = ops.listed(target.proxy)
            if proxy:
                ops.require(proxy["Config"]["Labels"].get(ops.LABEL), "Sidecar do ensaio sem identificação.")
                ops.docker("rm", "-f", proxy["Id"])
            containers = ops.docker("ps", "-aq", "--no-trunc", "--filter",
                                    f"label=com.supabase.cli.project={project}").decode().splitlines()
            if containers:
                ops.docker("rm", "-f", *containers)
            existing, = json.loads(ops.docker("volume", "inspect", volume))
            ops.require(existing["Labels"].get(ops.LABEL) == project, "Volume do ensaio sem identificação.")
            ops.docker("volume", "rm", volume)
            ops.docker("network", "rm", target.network)
            after = container_fingerprint()
            ops.require(all(after.get(container_id) == started for container_id, started in baseline.items()),
                        "Estado de execução de um container preexistente mudou.")
    print("PASS: ensaio completo, reversão normal e sob falha, originais íntegros e limpeza verificada.", flush=True)


if __name__ == "__main__":
    os.umask(0o077)
    signal.signal(signal.SIGTERM, ops.interrupt)
    signal.signal(signal.SIGINT, ops.interrupt)
    try:
        main()
    except ops.OperationError as error:
        sys.exit(str(error))
    except Exception as error:
        sys.exit(f"Ensaio interrompido ({type(error).__name__}).")
