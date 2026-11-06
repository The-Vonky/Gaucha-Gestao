#!/usr/bin/env python3
"""GG-02B: laboratório local sintético; somente biblioteca padrão Python."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import subprocess
import sys
import time
import uuid


class Refused(RuntimeError):
    """Falha fechada, sem tentativa de reparo/limpeza."""


PREFIX = "gg-02b-"
MARKER = "GG-02B-SYNTHETIC-v1"
MIB = 1024 * 1024


def require(condition, message):
    if not condition:
        raise Refused(message)


def save(path, value):
    # Exclusivo: nunca sobrescrever evidências de uma execução anterior.
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False)
        stream.write("\n")


def fixture(version=1):
    # SHAKE gera bytes determinísticos pouco compressíveis, sem ler arquivos externos.
    blob = hashlib.shake_256(b"GG-02B: exclusivamente ficticio").digest(16 * MIB)
    data = {
        "objects/blob-a.bin": blob,
        "objects/blob-duplicate.bin": blob,
        "data/records.txt": b"GG-02B DADOS FICTICIOS\nversao=1\n",
        "structure/rebuild.txt": b"GG-02B ESTRUTURA FICTICIA; sem runtime ou segredos\n",
        "manifest.json": b'{"synthetic":true,"schema":"GG-02B-v1"}\n',
    }
    if version == 2:
        changed = bytearray(blob)
        changed[8 * MIB:8 * MIB + 4096] = hashlib.shake_256(b"delta GG-02B").digest(4096)
        data["objects/blob-a.bin"] = bytes(changed)
        data["data/records.txt"] = b"GG-02B DADOS FICTICIOS\nversao=2\n"
        data["objects/new.bin"] = hashlib.shake_256(b"novo GG-02B").digest(MIB)
    return data


def expected(version):
    return {name: {"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}
            for name, content in fixture(version).items()}


def inspect_tree(root):
    """Recusa links, arquivos especiais e hardlinks antes de ler qualquer conteúdo."""
    result = {}
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            path = Path(directory) / name
            info = path.lstat()
            require(info.st_uid == os.getuid(), "Entrada de outro proprietário.")
            require(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode),
                    "Link ou arquivo especial recusado.")
            if stat.S_ISREG(info.st_mode):
                require(info.st_nlink == 1, "Hardlink recusado.")
                result[str(path.relative_to(root))] = path
    return result


def validate_lab(raw):
    root = Path(raw)
    require(root.is_absolute() and root.parent == Path("/tmp")
            and re.fullmatch(r"gg-02b-[0-9a-f]{32}", root.name),
            "Destino fora da allowlist /tmp/gg-02b-<uuid hexadecimal>.")
    require(root.resolve() == root and not root.is_symlink(), "Caminho não canônico.")
    info = root.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid()
            and stat.S_IMODE(info.st_mode) == 0o700, "Laboratório deve ser próprio e 0700.")
    inspect_tree(root)
    require((root / "LAB.json").read_text() == json.dumps({"kind": MARKER}) + "\n",
            "Marcador de laboratório inválido.")
    return root


def verify_source(source, version):
    files = inspect_tree(source)
    wanted = expected(version)
    require(files.keys() == wanted.keys(), "Lista de arquivos diverge da massa sintética.")
    for name, path in files.items():
        require(path.stat().st_size == wanted[name]["bytes"], "Tamanho sintético divergente.")
        require(hashlib.sha256(path.read_bytes()).hexdigest() == wanted[name]["sha256"],
                "SHA-256 divergente da massa sintética.")
    return {"files": len(files), "bytes": sum(v["bytes"] for v in wanted.values()),
            "sha256": "PASS"}


def clean_env(root):
    # Não herda RESTIC_*, RCLONE_*, proxies, credenciais ou HOME do operador.
    return {"PATH": os.defpath, "HOME": str(root / "home"), "TMPDIR": str(root / "tmp"),
            "LANG": "C", "LC_ALL": "C", "GOMAXPROCS": "2"}


def preflight():
    found = {name: shutil.which(name) for name in ("restic", "rclone")}
    return {"python": sys.version.split()[0], "tools": found,
            "status": "PASS" if found["restic"] else "BLOCKED",
            "rclone_required_for_local_lab": False,
            "free_tmp_bytes": shutil.disk_usage("/tmp").free}


def prepare():
    require(shutil.disk_usage("/tmp").free >= 512 * MIB, "Exige 512 MiB livres em /tmp.")
    root = Path("/tmp") / (PREFIX + uuid.uuid4().hex)
    root.mkdir(mode=0o700)
    (root / "LAB.json").write_text(json.dumps({"kind": MARKER}) + "\n")
    for name in ("source", "evidence", "home", "tmp"):
        (root / name).mkdir(mode=0o700)
    for name, content in fixture().items():
        path = root / "source" / name
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with path.open("xb") as stream:
            stream.write(content)
    save(root / "evidence" / "expected-v1.json", expected(1))
    save(root / "evidence" / "expected-v2.json", expected(2))
    save(root / "evidence" / "prepared.json", {
        "preflight": preflight(), "fixture": verify_source(root / "source", 1),
        "unique_content_bytes": sum(len(v) for k, v in fixture().items()
                                    if k != "objects/blob-duplicate.bin"),
    })
    return root


def sizes(root):
    if not root.exists():
        return {"logical_bytes": 0, "allocated_bytes": 0, "data_pack_bytes": 0}
    entries = [root, *root.rglob("*")]
    return {
        "logical_bytes": sum(p.stat().st_size for p in entries if p.is_file()),
        "allocated_bytes": sum(p.stat().st_blocks * 512 for p in entries),
        "data_pack_bytes": sum(p.stat().st_size for p in (root / "data").rglob("*")
                               if p.is_file()),
    }


class Runner:
    def __init__(self, root):
        self.root = validate_lab(str(root))
        self.binary = preflight()["tools"]["restic"]
        require(self.binary is not None, "BLOCKED: Restic ausente; nada instalado.")

    def command(self, label, repo, password, args, wrong_password=False, source=False):
        validate_lab(str(self.root))
        require(repo in (self.root / "primary", self.root / "secondary-computer/repository"),
                "Repositório fora da allowlist.")
        require(password in (self.root / "primary-password",
                             self.root / "secondary-computer/recovery-password"),
                "Credencial fora da allowlist.")
        require(stat.S_IMODE(password.stat().st_mode) == 0o600, "Credencial deve ser 0600.")
        started = time.perf_counter()
        before = sizes(repo)
        result = subprocess.run(
            [self.binary, "--repo", str(repo), "--password-file", str(password),
             "--no-cache", *args], cwd=self.root / "source" if source else self.root,
            env=clean_env(self.root),
            stdin=subprocess.DEVNULL, capture_output=True, text=True, check=False,
        )
        elapsed = time.perf_counter() - started
        # Saídas somente de Restic sobre massa sintética; nunca registrar ambiente/senha.
        evidence = {"seconds": round(elapsed, 6), "exit_code": result.returncode,
                    "before": before, "after": sizes(repo),
                    "stdout": result.stdout, "stderr": result.stderr}
        save(self.root / "evidence" / (label + ".json"), evidence)
        if wrong_password:
            require(result.returncode != 0 and "wrong password" in
                    (result.stderr + result.stdout).lower(),
                    "Senha incorreta não produziu rejeição inequívoca.")
        else:
            require(result.returncode == 0, f"Restic falhou em {label}; consultar evidência local.")
        return evidence

    def snapshot_map(self, repo, password, label):
        data = self.command(label, repo, password, ["snapshots", "--json"])
        entries = json.loads(data["stdout"])
        require(len(entries) == 3, "Esperados exatamente três snapshots.")
        result = {}
        for tag in ("initial", "unchanged", "changed"):
            matches = [s for s in entries if tag in s.get("tags", [])]
            require(len(matches) == 1, "Tags de snapshots divergentes.")
            snapshot_id = matches[0]["id"]
            require(re.fullmatch("[0-9a-f]{64}", snapshot_id), "ID inválido.")
            result[tag] = snapshot_id
        return result

    def restores(self, repo, password, snapshots, label):
        verified = {}
        for tag, snapshot_id in snapshots.items():
            target = self.root / (label + "-" + tag)
            require(not target.exists(), "Destino de restore já existe; execução não retomável.")
            self.command(label + "-" + tag, repo, password,
                         ["restore", snapshot_id, "--target", str(target)])
            verified[tag] = verify_source(target, 2 if tag == "changed" else 1)
        save(self.root / "evidence" / (label + "-sha256.json"), verified)


def credential(path):
    with path.open("x", encoding="ascii") as stream:
        os.chmod(path, 0o600)
        stream.write(secrets.token_hex(32) + "\n")


def run(raw):
    root = validate_lab(raw)
    verify_source(root / "source", 1)
    runner = Runner(root)  # Ausência da ferramenta bloqueia antes de criar credenciais/repos.
    require(set(p.name for p in root.iterdir()) ==
            {"LAB.json", "source", "evidence", "home", "tmp"},
            "Estado inicial inesperado; prepare um laboratório novo.")
    require(not (root / "RUN-STARTED.json").exists(),
            "Laboratório já iniciado; preserve-o e prepare outro, sem limpeza automática.")
    save(root / "RUN-STARTED.json", {"status": "STARTED"})
    primary = root / "primary"
    secondary = root / "secondary-computer/repository"
    pw1 = root / "primary-password"
    pw2 = root / "secondary-computer/recovery-password"
    require(not primary.exists() and not secondary.parent.exists() and not pw1.exists(),
            "Destino já existe.")
    secondary.parent.mkdir(mode=0o700)
    credential(pw1)
    credential(pw2)
    require(pw1.read_bytes() != pw2.read_bytes(), "Credenciais devem ser distintas.")
    version = subprocess.run([runner.binary, "version"], env=clean_env(root),
                             capture_output=True, text=True, check=True)
    save(root / "evidence/restic-version.json", {"version": version.stdout.strip()})
    runner.command("init-primary", primary, pw1, ["init", "--repository-version", "2"])
    # Permite parâmetros de chunking comuns e chaves de cifra distintas.
    runner.command("init-secondary", secondary, pw2,
                   ["init", "--repository-version", "2", "--from-repo", str(primary),
                    "--from-password-file", str(pw1), "--copy-chunker-params"])
    runner.command("wrong-password-primary", primary, pw2, ["snapshots"], wrong_password=True)
    runner.command("wrong-password-secondary", secondary, pw1, ["snapshots"], wrong_password=True)
    rows = []
    snapshots = {}
    for tag, revision in (("initial", 1), ("unchanged", 1), ("changed", 2)):
        if revision == 2:
            # Somente dois arquivos conhecidos são alterados e um é acrescentado.
            changed = fixture(2)
            for name in ("objects/blob-a.bin", "data/records.txt"):
                (root / "source" / name).write_bytes(changed[name])
            with (root / "source/objects/new.bin").open("xb") as stream:
                stream.write(changed["objects/new.bin"])
        verify_source(root / "source", revision)
        entry = runner.command("backup-" + tag, primary, pw1,
                               ["backup", ".", "--host", "gg02b-synthetic", "--tag", tag,
                                "--json", "--compression", "off"], source=True)
        summaries = [json.loads(line) for line in entry["stdout"].splitlines()]
        summary = next(s for s in summaries if s.get("message_type") == "summary")
        snapshots[tag] = summary["snapshot_id"]
        rows.append({"tag": tag, "seconds": entry["seconds"], "summary": summary,
                     "before": entry["before"], "after": entry["after"],
                     "growth_bytes": entry["after"]["logical_bytes"] - entry["before"]["logical_bytes"]})
        save(root / "evidence" / ("measurement-" + tag + ".json"), rows[-1])
    # O contrato JSON permite omitir campos cujo valor é zero.
    require(rows[1]["summary"].get("data_blobs", 0) == 0, "Sem mudança adicionou blobs de dados.")
    require(rows[1]["after"]["data_pack_bytes"] == rows[1]["before"]["data_pack_bytes"],
            "Sem mudança aumentou packs de dados.")
    require(rows[0]["after"]["data_pack_bytes"] < 24 * MIB,
            "Duplicata de 16 MiB parece ter sido armazenada integralmente.")
    require(0 < rows[2]["growth_bytes"] < rows[0]["growth_bytes"],
            "Delta não apresentou crescimento incremental menor que a primeira captura.")
    runner.command("check-primary", primary, pw1, ["check", "--read-data"])
    primary_map = runner.snapshot_map(primary, pw1, "snapshots-primary")
    require(primary_map == snapshots, "IDs do backup divergem da listagem.")
    runner.restores(primary, pw1, primary_map, "restore-primary")
    runner.command("copy-secondary", secondary, pw2,
                   ["copy", "--from-repo", str(primary), "--from-password-file", str(pw1)])
    secondary_map = runner.snapshot_map(secondary, pw2, "snapshots-secondary")
    save(root / "evidence/secondary-map.json", secondary_map)
    # Renomear não apaga nem modifica os blocos. Não restaurar os caminhos na recuperação.
    primary.rename(root / "primary-unavailable")
    pw1.rename(root / "primary-password-unavailable")
    (root / "source").rename(root / "source-unavailable")
    save(root / "evidence/measurements.json", rows)
    recover_secondary(str(root))
    save(root / "evidence/result.json", {
        "status": "PASS", "scope": "file-only synthetic, same host and filesystem",
        "encryption_wrong_password": "PASS", "deduplication": "PASS",
        "historical_restore_sha256": "PASS", "secondary_restore_sha256": "PASS",
        "check_read_data_both": "PASS", "physical_offsite_and_key_custody": "BLOCKED",
    })
    return {"status": "PASS", "lab": str(root), "evidence": str(root / "evidence")}


def recover_secondary(raw):
    root = validate_lab(raw)
    require(not any((root / name).exists() for name in ("primary", "primary-password", "source")),
            "Recuperação independente exige caminhos originais do primário/origem indisponíveis.")
    runner = Runner(root)
    repo = root / "secondary-computer/repository"
    password = root / "secondary-computer/recovery-password"
    snapshots = runner.snapshot_map(repo, password, "offline-snapshots")
    require(snapshots == json.loads((root / "evidence/secondary-map.json").read_text()),
            "Snapshots secundários divergentes após indisponibilidade do primário.")
    runner.command("check-secondary-offline", repo, password, ["check", "--read-data"])
    runner.restores(repo, password, snapshots, "restore-secondary-offline")
    return {"status": "PASS", "primary_paths_absent": True, "cache": False}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("preflight", "prepare", "run", "recover-secondary"))
    parser.add_argument("lab", nargs="?")
    args = parser.parse_args()
    try:
        require(os.getuid() != 0 and not os.environ.get("SUDO_USER"), "Não executar com sudo/root.")
        if args.action in ("preflight", "prepare"):
            require(args.lab is None, "Este comando não recebe caminho.")
            result = preflight() if args.action == "preflight" else {"lab": str(prepare())}
        else:
            require(args.lab is not None, "Informe o diretório criado por prepare.")
            result = run(args.lab) if args.action == "run" else recover_secondary(args.lab)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 2 if result.get("status") == "BLOCKED" else 0
    except (Refused, OSError, ValueError, KeyError, StopIteration, subprocess.SubprocessError) as exc:
        # Sem traceback, args de subprocess ou conteúdo de arquivos nas mensagens.
        detail = str(exc) if isinstance(exc, Refused) else type(exc).__name__
        print(json.dumps({"status": "BLOCKED" if "BLOCKED:" in detail else "FAIL",
                          "reason": detail}, ensure_ascii=False), file=sys.stderr)
        return 2 if "BLOCKED:" in detail else 1


if __name__ == "__main__":
    sys.exit(main())
