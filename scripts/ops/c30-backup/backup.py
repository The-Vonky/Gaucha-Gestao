#!/usr/bin/env python3
"""Captura e envio restritos ao STAGING Gaúcha Gestão. Ver o runbook antes de instalar."""
import configparser
import fcntl
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

CONFIG = Path("/etc/gaucha-gestao/backup")
STATE = Path("/var/lib/gaucha-backup")
JOURNAL = "thaw.json"
PROJECT = "gaucha-staging"
WRITERS = ("kong", "rest", "auth", "storage")
STORAGE = Path("/armazenamento2/gaucha-gestao/staging/storage")
PGDATA = "/armazenamento2/gaucha-gestao/staging/postgres"
DRIVE = "rclone:gg-c30:repository"
SHARED_CLIENT = "202264815644.apps.googleusercontent.com"
RCLONE = ("-o", "rclone.program=/usr/bin/rclone", "-o",
          "rclone.args=serve restic --stdio --append-only --retries 2 --contimeout 15s --timeout 60s")
ENV = {"PATH": "/usr/bin:/bin", "HOME": "/var/lib/gaucha-backup", "LC_ALL": "C", "TZ": "UTC"}


def require(condition, code):
    if not condition:
        raise ValueError(code)


def command(*args, seconds=30, output=None, env=ENV):
    # Nunca registrar argv, stdout bruto, stderr, env ou mensagens de exceção do subprocesso.
    process = subprocess.run(args, timeout=seconds, check=True, stdin=subprocess.DEVNULL,
                             stdout=output or subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)
    return process.stdout


def private(path, directory=False):
    info = path.lstat()
    kind = stat.S_ISDIR if directory else stat.S_ISREG
    require(kind(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o077 and
            (directory or info.st_nlink == 1) and path.resolve() == path, "unsafe-local-path")


def settings():
    private(CONFIG, directory=True)
    path = CONFIG / "target.json"
    private(path)
    cfg = json.loads(path.read_text())
    require(cfg["approved"] is True and re.fullmatch(r"[0-9a-f]{32}", cfg["machine_id"]) and
            Path("/etc/machine-id").read_text().strip() == cfg["machine_id"] and
            re.fullmatch(r"[a-zA-Z0-9_.-]{1,80}", cfg["instance_id"]) and
            re.fullmatch(r"[a-zA-Z0-9_-]{10,128}", cfg["drive_folder_id"]) and
            re.fullmatch(r"[0-9a-f]{40}", cfg["release"]) and
            all(type(cfg[key]) is int and cfg[key] > 0 for key in
                ("disk_reserve_bytes", "drive_reserve_bytes")), "target-unapproved-or-invalid")
    return cfg


def inspect(service, ref):
    item, = json.loads(command("docker", "--host", "unix:///var/run/docker.sock",
                               "inspect", "--type", "container", ref, seconds=8))
    labels = item["Config"]["Labels"]
    require(item["Name"] == f"/{PROJECT}-{service}-1" and
            labels["com.docker.compose.project"] == PROJECT and
            labels["com.docker.compose.service"] == service and
            re.fullmatch(r"[a-f0-9]{64}", item["Id"]) and
            (not re.fullmatch(r"[a-f0-9]{64}", ref) or ref == item["Id"]),
            "container-identity")
    return item


def docker(*args, **kwargs):
    return command("docker", "--host", "unix:///var/run/docker.sock", *args, **kwargs)


def target(cfg):
    containers = {name: inspect(name, f"{PROJECT}-{name}-1") for name in ("db", *WRITERS)}
    for name, item in containers.items():
        require(item["State"]["Running"] and not item["State"]["Paused"] and
                item["HostConfig"]["RestartPolicy"]["Name"] == "no" and
                item["Image"] == cfg["images"][name] and
                re.fullmatch(r"sha256:[a-f0-9]{64}", item["Image"]), "container-state-or-image")
    for name, source, destination in (("storage", str(STORAGE), "/var/lib/storage"),
                                      ("db", PGDATA, "/var/lib/postgresql/data")):
        matches = [m for m in containers[name]["Mounts"] if m["Destination"] == destination]
        require(len(matches) == 1 and matches[0]["Type"] == "bind" and
                matches[0]["Source"] == source and Path(source).resolve() == Path(source),
                "mount-identity")
    db = containers["db"]
    networks = db["NetworkSettings"]["Networks"]
    require(set(networks) == {PROJECT + "_default"}, "db-network-identity")
    network_id = networks[PROJECT + "_default"]["NetworkID"]
    require(re.fullmatch(r"[a-f0-9]{64}", network_id), "db-network-identity")
    network, = json.loads(docker("network", "inspect", network_id, seconds=8))
    require(network["Driver"] == "bridge" and network["Labels"]["com.docker.compose.project"] == PROJECT and
            set(network["Containers"]) == {item["Id"] for item in containers.values()}, "db-network-membership")
    require(db["HostConfig"]["NetworkMode"] != "host" and
            not any(db["NetworkSettings"]["Ports"].values()), "db-published")
    value = sql(db["Id"], "SELECT environment || ':' || instance_id FROM infra_control.target")
    require(value == "staging:" + cfg["instance_id"], "db-identity")
    require(sql(db["Id"], "SELECT count(*) FROM pg_database WHERE NOT datistemplate AND datname <> 'postgres'") == "0",
            "unexpected-database")
    return containers


def pg(container, tool, *args, **kwargs):
    return docker("exec", container, tool, "--no-password", "--host", "localhost", "--username", "supabase_admin", *args, **kwargs)


def sql(container, statement):
    return pg(container, "psql", "--dbname", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1",
              "-c", statement).decode().strip()


def quiet_db(container):
    # Os clientes da aplicação devem ter saído, incluindo conexões ociosas.
    # Launchers sem banco associado ficam fora. Jobs e writers externos exigem inventário separado.
    count = sql(container, """
        SELECT count(*) FROM pg_stat_activity
        WHERE datname IS NOT NULL AND pid <> pg_backend_pid()
          AND backend_type IS DISTINCT FROM 'autovacuum worker'
    """)
    require(count == "0", "db-writers-present")
    require(sql(container, "SELECT count(*) FROM pg_subscription WHERE subenabled") == "0",
            "logical-subscription-enabled")
    if sql(container, "SELECT to_regclass('cron.job') IS NOT NULL") == "t":
        require(sql(container, "SELECT count(*) FROM cron.job WHERE active") == "0", "db-jobs-active")


def files(root):
    for entry in sorted(root.rglob("*")):
        info = entry.lstat()
        require(stat.S_ISDIR(info.st_mode) or
                stat.S_ISREG(info.st_mode) and info.st_nlink == 1, "unsupported-tree-entry")
        if stat.S_ISREG(info.st_mode):
            yield entry


def manifest(root, durable=False):
    result = {}
    for entry in files(root):
        if entry == root / "manifest.json":
            continue
        digest = hashlib.sha256()
        with entry.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
            if durable:
                os.fsync(stream.fileno())
        result[entry.relative_to(root).as_posix()] = {"bytes": entry.stat().st_size, "sha256": digest.hexdigest()}
    return result


def verify(package):
    index = package / "manifest.json"
    require(package.is_dir() and not package.is_symlink() and index.is_file() and not index.is_symlink(),
            "package-path")
    data = json.loads(index.read_text())
    require(data["schema"] == 1 and data["scope"] == PROJECT and
            re.fullmatch(r"[a-f0-9]{32}", data["capture_id"]) and
            {"postgres.dump", "roles.sql", "storage.tar", "recovery.age", "structure/rebuild.json"}
            <= data["files"].keys() and data["files"] == manifest(package), "package-integrity")
    return data


def atomic_json(path, data):
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".new")
    with temporary.open("x") as stream:
        json.dump(data, stream, indent=2, sort_keys=True)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def capture():
    invocation = os.environ.get("INVOCATION_ID", "")
    require(re.fullmatch(r"[0-9a-f]{32}", invocation) and
            command("systemctl", "show", "--property=InvocationID", "--value",
                    "gaucha-backup-capture.service").decode().strip() == invocation,
            "systemd-watchdog-required")
    cfg = settings()
    journal = STATE / JOURNAL
    package = STATE / "pending"
    building = STATE / "building"
    require(not any(p.exists() for p in (journal, package, building)), "capture-state-exists")
    require(STORAGE.is_dir() and STORAGE.resolve() == STORAGE, "storage-path")
    command("mountpoint", "-q", "/armazenamento2")
    containers = target(cfg)
    structure = CONFIG / "structure"
    recovery = CONFIG / "recovery.age"
    private(structure, directory=True)
    private(recovery)
    for entry in files(structure):
        private(entry)
    require((structure / "rebuild.json").is_file(), "rebuild-manifest-missing")
    age_header = b"age-encryption.org/v1\n"
    with recovery.open("rb") as stream:
        require(stream.read(len(age_header)) == age_header, "recovery-age-required")
    db = containers["db"]["Id"]
    size = int(sql(db, "SELECT pg_database_size(current_database())"))
    storage_bytes = int(command("du", "-s", "-B1", "--apparent-size", str(STORAGE)).split()[0])
    require(shutil.disk_usage(STATE).free > cfg["disk_reserve_bytes"] + 2 * (size + storage_bytes),
            "insufficient-staging-space")
    building.mkdir(mode=0o700)
    shutil.copytree(structure, building / "structure")
    shutil.copyfile(recovery, building / "recovery.age")
    ids = {name: containers[name]["Id"] for name in WRITERS}
    atomic_json(journal, ids)
    for name in WRITERS:
        grace = 60 if name == "storage" else 15
        docker("stop", "--time", str(grace), ids[name], seconds=grace + 10)
    for name in WRITERS:
        state = inspect(name, ids[name])["State"]
        require(not state["Running"] and state["ExitCode"] in {0, 143} and not state["OOMKilled"],
                "freeze-incomplete-or-forced")
        if name == "storage":
            require(state["ExitCode"] == 0, "storage-shutdown-not-clean")
    quiet_db(db)
    for mount in command("findmnt", "--list", "--raw", "--noheadings", "--output", "TARGET").decode().splitlines():
        require(not mount.startswith(str(STORAGE) + "/"), "nested-storage-mount")
    for _ in files(STORAGE):
        pass
    captured_at = datetime.now(timezone.utc).isoformat()
    with (building / "postgres.dump").open("xb") as output:
        pg(db, "pg_dump", "--dbname", "postgres", "--format=custom", "--compress=0", "--create",
           "--lock-wait-timeout=5s", seconds=150, output=output)
    with (building / "roles.sql").open("xb") as output:
        pg(db, "pg_dumpall", "--database", "postgres", "--roles-only", "--no-role-passwords",
           seconds=30, output=output)
    command("tar", "--create", "--numeric-owner", "--acls", "--xattrs", "--one-file-system",
            "--file", str(building / "storage.tar"), "--directory", str(STORAGE), ".", seconds=150)
    require(all(not inspect(name, ids[name])["State"]["Running"] for name in WRITERS), "freeze-interrupted")
    quiet_db(db)
    with (building / "postgres.dump").open("rb") as dump:
        require(dump.read(5) == b"PGDMP", "invalid-dump-header")
    require((building / "roles.sql").stat().st_size > 0, "empty-database-capture")
    atomic_json(building / "manifest.json", {
        "schema": 1, "scope": PROJECT, "capture_id": uuid.uuid4().hex, "captured_at": captured_at,
        "release": cfg["release"], "images": cfg["images"], "files": manifest(building, durable=True),
    })
    building.rename(package)
    # Persiste a publicação antes de encerrar a janela de captura.
    fd = os.open(STATE, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def thaw():
    journal = STATE / JOURNAL
    if not journal.exists():
        return
    private(journal)
    ids = json.loads(journal.read_text())
    require(set(ids) == set(WRITERS) and all(re.fullmatch(r"[a-f0-9]{64}", v) for v in ids.values()),
            "bad-thaw-journal")
    failed = False
    for name in reversed(WRITERS):
        try:
            item = inspect(name, ids[name])
            if not item["State"]["Running"]:
                docker("start", ids[name], seconds=15)
            require(inspect(name, ids[name])["State"]["Running"], "restart-failed")
        except (ValueError, OSError, subprocess.SubprocessError, KeyError):
            failed = True
    require(not failed, "thaw-incomplete")
    journal.unlink()


def drive_env(cfg):
    private(CONFIG / "drive", directory=True)
    path = CONFIG / "drive" / "rclone.conf"
    private(path)
    parser = configparser.ConfigParser(interpolation=None, default_section="__NO_DEFAULTS__")
    parser.read(path)
    require(parser.sections() == ["gg-c30"] and not parser.defaults(), "drive-remote")
    section = parser["gg-c30"]
    require(set(section) == {"type", "scope", "client_id", "client_secret", "token", "root_folder_id"} and
            section["type"] == "drive" and section["scope"] == "drive.file" and
            re.fullmatch(r"[0-9]+-[a-zA-Z0-9_-]+[.]apps[.]googleusercontent[.]com", section["client_id"]) and
            section["client_id"] != SHARED_CLIENT and re.fullmatch(r"[a-zA-Z0-9_-]{8,}", section["client_secret"]) and
            section["root_folder_id"] == cfg["drive_folder_id"] and
            bool(json.loads(section["token"]).get("refresh_token")), "drive-client-scope-or-folder")
    return dict(ENV, RCLONE_CONFIG=str(path), RCLONE_DRIVE_SKIP_SHORTCUTS="true")


def restic(repo, password, *args, env=ENV, seconds=3600):
    private(password)
    return command("restic", "--no-cache", "--repo", str(repo), "--password-file", str(password),
                   *RCLONE, *args, env=env, seconds=seconds)


def check_quota(cfg, env, expected=0):
    quota = json.loads(command("rclone", "about", "gg-c30:", "--json", env=env, seconds=90))
    free, total = quota["free"], quota["total"]
    require(type(free) is int and type(total) is int and
            cfg["drive_reserve_bytes"] + expected < free <= total, "drive-quota-or-reserve")


def upload(package, cfg):
    data = verify(package)
    env = drive_env(cfg)
    password = CONFIG / "restic-password"
    tag = "c30-" + data["capture_id"]
    existing = json.loads(restic(DRIVE, password, "snapshots", "--no-lock", "--json", "--tag", tag, env=env))
    require(len(existing) <= 1, "duplicate-capture-tag")
    if not existing:
        check_quota(cfg, env, sum(file["bytes"] for file in data["files"].values()))
        restic(DRIVE, password, "backup", "--host", PROJECT, "--tag", tag, str(package), env=env)
    restic(DRIVE, password, "check", env=env)
    snapshots = json.loads(restic(DRIVE, password, "snapshots", "--no-lock", "--json", "--tag", tag, env=env))
    require(len(snapshots) == 1 and re.fullmatch(r"[a-f0-9]{64}", snapshots[0]["id"]), "snapshot-unverified")
    atomic_json(STATE / "last-success.json", {
        "captured_at": data["captured_at"], "snapshot": snapshots[0]["id"],
    })
    sent = STATE / "sent"
    package.rename(sent)
    shutil.rmtree(sent)


def backup():
    cfg = settings()
    with (STATE / "backup.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        require(not (STATE / JOURNAL).exists(), "previous-thaw-required")
        sent = STATE / "sent"
        if sent.exists():
            private(sent, directory=True)
            shutil.rmtree(sent)
        package = STATE / "pending"
        building = STATE / "building"
        require(not building.exists(), "incomplete-capture-needs-review")
        if not package.exists():
            env = drive_env(cfg)
            check_quota(cfg, env)
            restic(DRIVE, CONFIG / "restic-password", "cat", "config", "--no-lock", env=env, seconds=120)
            # TimeoutStartSec e ExecStopPost são gerenciados pelo systemd, fora deste processo.
            command("systemctl", "start", "gaucha-backup-capture.service", seconds=590)
        require(not (STATE / JOURNAL).exists(), "thaw-required")
        private(package, directory=True)
        deadline = time.monotonic() + 150
        while True:
            states = [inspect(name, f"{PROJECT}-{name}-1")["State"] for name in ("db", *WRITERS)]
            if all(state["Running"] and state.get("Health", {}).get("Status", "healthy") == "healthy"
                   for state in states):
                break
            require(time.monotonic() < deadline, "gaucha-service-not-healthy")
            time.sleep(5)
        upload(package, cfg)


def replicate(snapshot):
    require(re.fullmatch(r"[a-f0-9]{64}", snapshot), "snapshot-id-required")
    cfg = settings()
    mount = Path("/mnt/gaucha-backup-offline")
    require(mount.resolve() == mount, "offline-mount-path")
    device = command("findmnt", "--noheadings", "--raw", "--output", "SOURCE", "--mountpoint", str(mount))
    require(device.decode().strip().startswith("/dev/") and
            mount.stat().st_dev not in {STATE.stat().st_dev, STORAGE.stat().st_dev}, "offline-media-required")
    repo = mount / "repository"
    private(repo, directory=True)
    remote_password = CONFIG / "restic-password"
    offline_password = CONFIG / "offline-password"
    for password in (remote_password, offline_password):
        private(password)
    require(remote_password.read_bytes().strip() != offline_password.read_bytes().strip(), "offline-password-reused")
    env = drive_env(cfg)
    restic(repo, offline_password, "copy", "--from-repo", DRIVE,
           "--from-password-file", str(remote_password), snapshot, env=env)
    restic(repo, offline_password, "check", "--read-data")
    # O repositório secundário gera seu próprio ID de snapshot.
    print("Conferir ID secundário com restic snapshots na mídia antes de desconectá-la.")


def restore_local(snapshot, repo, password, destination):
    require(re.fullmatch(r"[a-f0-9]{64}", snapshot), "snapshot-id-required")
    for path in (repo, password, destination):
        require(path.is_absolute() and path.resolve() == path, "restore-path")
    private(repo, directory=True)
    private(destination.parent, directory=True)
    require(not destination.exists() and not destination.is_symlink(),
            "restore-destination-exists")
    destination.mkdir(mode=0o700)
    restic(repo, password, "check", "--read-data", "--no-lock")
    restic(repo, password, "restore", snapshot, "--target", str(destination), "--verify", "--no-lock")
    verify(destination / STATE.relative_to("/") / "pending")


def main():
    os.umask(0o077)
    action = sys.argv[1] if len(sys.argv) > 1 else ""
    if action == "verify" and len(sys.argv) == 3:
        verify(Path(sys.argv[2]))
    elif action == "restore-local" and len(sys.argv) == 6:
        restore_local(sys.argv[2], *map(Path, sys.argv[3:]))
    elif action == "replicate" and len(sys.argv) == 3:
        private(STATE, directory=True)
        with (STATE / "backup.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            require(not (STATE / JOURNAL).exists(), "previous-thaw-required")
            replicate(sys.argv[2])
    elif len(sys.argv) == 2 and action in {"backup", "capture", "thaw"}:
        private(STATE, directory=True)
        {"backup": backup, "capture": capture, "thaw": thaw}[action]()
    else:
        raise ValueError("invalid-action")
    print(f"GG-C30 backup {action} PASS")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError, KeyError, TypeError, configparser.Error) as error:
        safe = str(error) if type(error) is ValueError and re.fullmatch(r"[a-z-]+", str(error)) else type(error).__name__
        print(f"GG-C30 backup FAIL [{safe}]", file=sys.stderr)
        sys.exit(1)
