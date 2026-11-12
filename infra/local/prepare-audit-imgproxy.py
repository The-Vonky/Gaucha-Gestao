#!/usr/bin/env python3
"""Ativação reversível de Storage/Kong pelo Docker local."""

import argparse
from contextlib import contextmanager
import errno
import fcntl
import hashlib
from http.client import HTTPConnection
import io
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
from dataclasses import dataclass
from urllib.parse import quote, urlencode, urlsplit

import yaml


STORAGE_IMAGE = "sha256:105a2584129c9600aebed6f5ac49ca4371c92b996ecd1af7179750333e9e2120"
KONG_IMAGE = "sha256:1b53405d8680a09d6f44494b7990bf7da2ea43f84a258c59717d4539abf09f6d"
IMGPROXY_IMAGE = "ghcr.io/imgproxy/imgproxy@sha256:db0b4b9cd690c8b3590203dea300fb759a18c4ec2af7b37424f0bdef23ce317d"
KONG_DIR = "/home/kong"
KONG_FILES = ("kong.yml", "localhost.crt", "localhost.key")
LABEL = "io.gauchagestao.audit-imgproxy"
LOCAL_DIR = Path(__file__).resolve().parent
SOCKET = "/var/run/docker.sock"


class OperationError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise OperationError(message)


def command(*args, data=None, timeout=90, allow_failure=False):
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=timeout, check=False)
    if result.returncode:
        if allow_failure:
            return None
        # Argumentos e saída podem conter credenciais, inclusive no laboratório.
        raise OperationError(f"Falha em {args[0]} ({result.returncode}).")
    return result.stdout


def docker(*args, **kwargs):
    return command("docker", "--host", f"unix://{SOCKET}", *args, **kwargs)


def engine(path, method="GET", data=None, content_type="application/json"):
    args = ["curl", "--silent", "--fail", "--max-time", "30", "--unix-socket", SOCKET,
            "-X", method, "-H", f"Content-Type: {content_type}"]
    if data is not None:
        args.extend(("--data-binary", "@-"))
    return command(*args, f"http://localhost{path}", data=data)


def inspect(name):
    return json.loads(docker("inspect", "--type", "container", name))[0]


def listed(name):
    matches = docker("ps", "-aq", "--no-trunc", "--filter", f"name=^/{name}$").decode().splitlines()
    require(len(matches) <= 1, "Nome de container ambíguo.")
    return inspect(matches[0]) if matches else None


def env_dict(container):
    return dict(entry.split("=", 1) for entry in container["Config"]["Env"])


@dataclass(frozen=True)
class Target:
    project: str
    port: int

    def service(self, name):
        return f"supabase_{name}_{self.project}"

    @property
    def network(self):
        return f"{self.project}-loopback"

    @property
    def proxy(self):
        return f"{self.project}-audit-imgproxy"

    @property
    def services(self):
        return (self.service("storage"), self.service("kong"))


LOCAL = Target("gaucha-gestao-local", 54321)


def healthy(container):
    return container["State"]["Running"] and container["State"].get("Health", {}).get("Status") == "healthy"


def wait_health(container_id, service):
    for _ in range(60):
        container = inspect(container_id)
        if healthy(container):
            return
        if not container["State"]["Running"] or container["State"].get("Health", {}).get("Status") == "unhealthy":
            break
        time.sleep(1)
    raise OperationError(f"{service} não atingiu estado healthy.")


def archive(container_id, file):
    return engine(f"/containers/{container_id}/archive?{urlencode({'path': f'{KONG_DIR}/{file}'})}")


def kong_signatures(container_id):
    signatures = {}
    for name in KONG_FILES:
        with tarfile.open(fileobj=io.BytesIO(archive(container_id, name))) as files:
            entries = files.getmembers()
            require(len(entries) == 1 and entries[0].name == name and entries[0].isfile(),
                    f"Kong precisa ter um arquivo regular em {name}.")
            entry = entries[0]
            signatures[name] = [hashlib.sha256(files.extractfile(entry).read()).hexdigest(),
                                entry.uid, entry.gid, entry.mode]
    return signatures


def kong_candidate(storage_name, kong):
    signatures = kong_signatures(kong["Id"])
    data = {name: docker("exec", kong["Id"], "cat", f"{KONG_DIR}/{name}") for name in KONG_FILES}
    require(all(hashlib.sha256(value).hexdigest() == signatures[name][0] for name, value in data.items()),
            "Arquivos do Kong mudaram durante a preparação.")
    declarative = yaml.safe_load(data["kong.yml"])
    service, = (item for item in declarative["services"] if item["name"] == "storage-v1")
    route, = (item for item in service["routes"] if item["paths"] == ["/storage/v1/"])
    require(route["name"] == "storage-v1-all" and service["url"] == f"http://{storage_name}:5000/",
            "Rota storage-v1 diferente da configuração ensaiada.")
    plugins = route.setdefault("plugins", [])
    require(all(plugin["name"] != "response-transformer" for plugin in plugins),
            "Rota Storage já contém response-transformer.")
    plugins.append({
        "name": "response-transformer",
        "config": {
            "remove": {"headers": ["Expires"]},
            # Kong 2.8 consulta os cabeçalhos originais ao decidir se deve adicionar.
            "replace": {"headers": ["Cache-Control:private, no-store"]},
            "add": {"headers": ["Cache-Control:private, no-store"]},
        },
    })
    data["kong.yml"] = yaml.safe_dump(declarative, sort_keys=False).encode()
    tar = io.BytesIO()
    with tarfile.open(fileobj=tar, mode="w") as files:
        for name, value in data.items():
            entry = tarfile.TarInfo(name)
            _, entry.uid, entry.gid, entry.mode = signatures[name]
            entry.size = len(value)
            files.addfile(entry, io.BytesIO(value))
    expected = {name: [hashlib.sha256(value).hexdigest(), *signatures[name][1:]] for name, value in data.items()}
    return tar.getvalue(), signatures, expected


def replacement(container, env, network, marker):
    config = container["Config"].copy()
    config.pop("Hostname", None)
    config["Image"] = container["Image"]
    config["Env"] = [f"{key}={value}" for key, value in env.items()]
    config["Labels"] = {**config["Labels"], LABEL: marker}
    config["HostConfig"] = {**container["HostConfig"], "LogConfig": {"Type": "none", "Config": {}}}
    endpoint = container["NetworkSettings"]["Networks"][network]
    config["NetworkingConfig"] = {"EndpointsConfig": {network: {"Aliases": endpoint["Aliases"]}}}
    return json.dumps(config).encode()


PROBE = """
const [mode, host] = process.argv.slice(1);
const http = require('node:http');
const net = require('node:net');
const assert = require('node:assert/strict');
function status(host, port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({host, port, path, timeout: 3000}, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
function refuses(host) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({host, port: 8080});
    sock.setTimeout(3000, () => sock.destroy(new Error('timeout')));
    sock.on('connect', () => sock.destroy(new Error('unexpected listener')));
    sock.on('error', e => e.code === 'ECONNREFUSED' ? resolve() : reject(e));
  });
}
(async () => {
  if (mode === 'outside') {
    for (const endpoint of [host, 'storage']) {
      assert.equal(await status(endpoint, 5000, '/status'), 200);
      await refuses(endpoint);
    }
  } else {
    assert.equal(await status('127.0.0.1', 8080, '/health'), 200);
  }
})().catch(() => { process.exitCode = 1; });
"""


def probe(network, *args, allow_failure=False):
    # A sonda usa apenas o Node da imagem fixada, sem executar o entrypoint do Storage.
    return docker("run", "--rm", "--pull=never", "--network", network, "--read-only", "--cap-drop=ALL",
                  "--security-opt=no-new-privileges", "--memory=128m", "--pids-limit=32",
                  "--entrypoint", "node", STORAGE_IMAGE, *args, timeout=20, allow_failure=allow_failure)


def verify_tools():
    require(shutil.which("docker") and shutil.which("curl"), "Docker CLI e curl são obrigatórios.")
    engine("/_ping")
    for image in (STORAGE_IMAGE, KONG_IMAGE, IMGPROXY_IMAGE):
        require(docker("image", "inspect", image, allow_failure=True) is not None,
                f"Imagem local ausente: {image}.")
    require(probe("none", "-e", """
        for (const mod of ['assert/strict', 'net', 'http']) require('node:' + mod);
        process.stdout.write(process.versions.node);
        """, allow_failure=True), "Imagem da sonda indisponível ou sem Node HTTP/TCP.")
    print("Pré-voo: Docker Engine, imagens locais e Node da sonda verificados.", flush=True)


def protected_services(target):
    return {role: [container["Id"], container["State"]["StartedAt"]]
            for role in ("db", "auth", "rest")
            for container in [inspect(target.service(role))]}


def verify_host_isolation():
    for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        with socket.socket(family) as client:
            client.settimeout(2)
            require(client.connect_ex((host, 8080)) == errno.ECONNREFUSED, "A porta 8080 deve recusar conexão no loopback do host.")


def verify_ports(target, storage, kong):
    require(not storage["NetworkSettings"]["Ports"] or
            all(bind is None for bind in storage["NetworkSettings"]["Ports"].values()),
            "Storage publicou uma porta.")
    require(kong["NetworkSettings"]["Ports"] == {"8000/tcp": [
        {"HostIp": "127.0.0.1", "HostPort": str(target.port)},
        {"HostIp": "::1", "HostPort": str(target.port)},
    ]}, "Portas do Kong diferentes do bind loopback esperado.")


def verify_volume(target, storage):
    require(storage["HostConfig"]["Binds"] == [f"{target.service('storage')}:/mnt"],
            "Bind do Storage diferente do inventário.")
    mount, = storage["Mounts"]
    require(mount["Type"] == "volume" and mount["Name"] == target.service("storage") and
            mount["Destination"] == "/mnt" and mount["RW"], "Volume de objetos diferente do inventário.")


def preflight(target):
    verify_tools()
    storage, kong = map(inspect, target.services)
    network, = json.loads(docker("network", "inspect", target.network))
    require(network["Driver"] == "bridge" and
            network["Options"].get("com.docker.network.bridge.host_binding_ipv4") == "127.0.0.1",
            "Rede Docker diferente do inventário loopback.")
    for container in (storage, kong):
        require(healthy(container) and container["Config"]["Labels"].get("com.supabase.cli.project") == target.project
                and list(container["NetworkSettings"]["Networks"]) == [target.network]
                and container["HostConfig"]["NetworkMode"] == target.network
                and not container["HostConfig"]["PublishAllPorts"], "Serviço, rede ou saúde diferente do inventário.")
    require((storage["Image"], kong["Image"]) == (STORAGE_IMAGE, KONG_IMAGE) and not kong["Mounts"],
            "Imagens ou montagem do Kong diferentes do inventário.")
    verify_ports(target, storage, kong)
    verify_volume(target, storage)
    require("storage" in storage["NetworkSettings"]["Networks"][target.network]["Aliases"],
            "Alias storage ausente.")
    for name in target.services:
        for suffix in ("-imgproxy-candidate", "-before-imgproxy"):
            require(listed(name + suffix) is None, "Nome reservado para troca ou reversão em uso.")
    require(listed(target.proxy) is None, "Nome reservado para imgproxy em uso.")
    verify_host_isolation()
    require(probe(target.network, "-e", PROBE, "outside", target.service("storage"), allow_failure=True) is not None,
            "Sonda externa falhou antes da troca.")
    storage_env, kong_env = env_dict(storage), env_dict(kong)
    require(storage_env.get("STORAGE_BACKEND") == "file" and storage_env.get("FILE_STORAGE_BACKEND_PATH") == "/mnt"
            and all(storage_env.get(key) == "false" for key in
                    ("ENABLE_IMAGE_TRANSFORMATION", "IMAGE_TRANSFORMATION_ENABLED")),
            "Backend ou flags de transformação diferentes do inventário.")
    require(kong_env.get("KONG_PLUGINS") == "request-transformer,cors", "Plugins do Kong diferentes do inventário.")
    docker("exec", kong["Id"], "test", "-r", "/usr/local/share/lua/5.1/kong/plugins/response-transformer/handler.lua")
    require(shutil.disk_usage(tempfile.gettempdir()).free > 10 * 1024 * 1024,
            "Espaço insuficiente para o registro privado.")
    tar, previous, expected = kong_candidate(storage["Name"][1:], kong)
    return storage, kong, tar, previous, expected


def http(target, method, path, *, key=None, token=None, body=None, content_type="application/json"):
    require(path.startswith("/") and not path.startswith("//"), "Caminho HTTP inesperado.")
    headers = {"Accept-Encoding": "identity"}
    if key:
        headers["apikey"] = key
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        headers["Content-Type"] = content_type
        if not isinstance(body, bytes):
            body = json.dumps(body).encode()
    conn = HTTPConnection("127.0.0.1", target.port, timeout=20)
    try:
        conn.request(method, path, body, headers)
        response = conn.getresponse()
        limit = 12 * 1024 * 1024
        payload = response.read(limit + 1)
        require(len(payload) <= limit, "Resposta HTTP excedeu o limite da verificação.")
        return response.status, response.headers, payload
    finally:
        conn.close()


def expect(response, status, stage):
    require(response[0] == status, f"{stage}: HTTP {response[0]}, esperado {status}.")
    return response[1:]


def original(target, fixture, token):
    path = quote(fixture["object"], safe="/")
    return expect(http(target, "GET", f"/storage/v1/object/authenticated/{path}",
                       key=fixture["apikey"], token=token), 200, "Original autorizado")


def login(target, fixture):
    _, payload = expect(http(target, "POST", "/auth/v1/token?grant_type=password", key=fixture["apikey"],
                             body={"email": fixture["email"], "password": fixture["password"]}), 200, "Login")
    return json.loads(payload)["access_token"]


def gateway(target, fixture, *, transformed, digest=None, token=None):
    expect(http(target, "GET", "/auth/v1/health", key=fixture["apikey"]), 200, "Saúde de Auth pelo Kong")
    expect(http(target, "GET", "/storage/v1/status"), 200, "Saúde de Storage pelo Kong")
    require(http(target, "GET", "/imgproxy/health")[0] == 404, "Rota inesperada para imgproxy no gateway.")
    token = token or login(target, fixture)
    expect(http(target, "GET", fixture["rest_path"], key=fixture["apikey"], token=token), 200, "Leitura REST")
    headers, data = original(target, fixture, token)
    current_digest = hashlib.sha256(data).hexdigest()
    require(digest is None or current_digest == digest, "Original diverge do hash anterior.")
    path = quote(fixture["object"], safe="/")
    sign = f"/storage/v1/object/sign/{path}"
    options = {"expiresIn": 60, "transform": {"width": 480, "height": 480, "resize": "contain"}}
    if transformed:
        require(headers.get_all("Cache-Control") == ["private, no-store"] and "Expires" not in headers,
                "Cabeçalhos de cache inesperados no original.")
        require(http(target, "POST", sign, body=options)[0] in (400, 401, 403, 404),
                "Assinatura anônima não foi recusada.")
        _, body = expect(http(target, "POST", sign, key=fixture["apikey"], token=token, body=options),
                         200, "Assinatura autorizada")
        url = urlsplit(json.loads(body)["signedURL"])
        require(not url.scheme and not url.netloc and url.path.startswith("/render/image/sign/") and url.query,
                "Storage não retornou o caminho local de transformação esperado.")
        render = f"/storage/v1{url.path}"
        require(http(target, "GET", render)[0] in (400, 401, 403, 404), "Render sem assinatura não foi recusado.")
        cache, thumbnail = expect(http(target, "GET", f"{render}?{url.query}"), 200, "Render assinado pelo Kong")
        require(cache.get_all("Cache-Control") == ["private, no-store"] and "Expires" not in cache,
                "Cabeçalhos de cache inesperados no render.")
        require(cache.get_content_type() in ("image/jpeg", "image/png") and thumbnail and thumbnail != data,
                "Resposta do render não contém uma miniatura distinta.")
        if cache.get_content_type() == "image/png":
            require(thumbnail[:8] == b"\x89PNG\r\n\x1a\n" and
                    0 < int.from_bytes(thumbnail[16:20], "big") <= 480 and
                    0 < int.from_bytes(thumbnail[20:24], "big") <= 480,
                    "Dimensões do PNG renderizado fora do limite.")
        require(hashlib.sha256(original(target, fixture, token)[1]).hexdigest() == current_digest,
                "Original mudou depois da transformação.")
    return current_digest, token


def load_fixture(path):
    require(stat.S_IMODE(path.stat().st_mode) == 0o600 and path.stat().st_uid == os.getuid(),
            "O arquivo de teste deve pertencer ao operador e ter modo 0600.")
    data = json.loads(path.read_text())
    for field in ("email", "password", "apikey", "object", "rest_path"):
        require(isinstance(data.get(field), str) and data[field], f"Campo de teste ausente: {field}.")
    require(data["object"].startswith("audit-checklist-evidence/") and data["rest_path"].startswith("/rest/v1/"),
            "Aponte para uma evidência privada existente e uma leitura REST local.")
    return data


def write_state(directory, state):
    temporary = directory / "state.tmp"
    with temporary.open("w") as output:
        json.dump(state, output)
        output.flush()
        os.fsync(output.fileno())
    temporary.replace(directory / "state.json")
    fd = os.open(directory, os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def create_candidate(name, payload):
    return json.loads(engine(f"/containers/create?{urlencode({'name': name})}", "POST", payload))["Id"]


def owned_container(name, marker):
    container = listed(name)
    if container is not None and container["Config"]["Labels"].get(LABEL) == marker:
        return container
    return None


def sidecar(target, storage_id, marker):
    proxy_id = docker("run", "--detach", "--pull=never", "--name", target.proxy,
                      "--label", f"{LABEL}={marker}", "--network", f"container:{storage_id}",
                      "--mount", f"type=volume,source={target.service('storage')},target=/isolated/mnt,readonly",
                      "--env-file", str(LOCAL_DIR / "audit-imgproxy.env"),
                      "--cpus=1", "--memory=512m", "--memory-swap=512m", "--pids-limit=64",
                      "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
                      "--log-driver=none", "--restart=no", IMGPROXY_IMAGE).decode().strip()
    proxy = inspect(proxy_id)
    mount, = proxy["Mounts"]
    require(proxy["HostConfig"]["NetworkMode"] == f"container:{storage_id}" and
            not proxy["HostConfig"]["PortBindings"] and not proxy["HostConfig"]["PublishAllPorts"] and
            mount["Name"] == target.service("storage") and mount["Destination"] == "/isolated/mnt" and not mount["RW"],
            "Topologia ou montagem do imgproxy diferente do esperado.")
    for _ in range(10):
        if probe(f"container:{storage_id}", "-e", PROBE, "inside", allow_failure=True) is not None:
            break
        time.sleep(1)
    else:
        raise OperationError("Sonda interna não alcançou imgproxy em loopback.")
    require(probe(target.network, "-e", PROBE, "outside", target.service("storage"), allow_failure=True) is not None,
            "Sonda externa não confirmou acesso ao Storage e recusa do imgproxy.")
    verify_host_isolation()


def rollback(target, directory, fixture, token=None):
    state = json.loads((directory / "state.json").read_text())
    marker = state["marker"]
    storage_name, kong_name = target.services
    for name in (kong_name, target.proxy, storage_name):
        names = (name,) if name == target.proxy else (name, f"{name}-imgproxy-candidate")
        for candidate_name in names:
            candidate = owned_container(candidate_name, marker)
            if candidate is not None:
                docker("rm", "-f", candidate["Id"])
    for name, original_id in zip(target.services, state["originals"]):
        original_container = inspect(original_id)
        require(original_container["Name"] in (f"/{name}", f"/{name}-before-imgproxy"),
                "Original em nome inesperado. Reversão interrompida.")
        occupant = listed(name)
        require(occupant is None or occupant["Id"] == original_id,
                "Nome original em uso por container de outra operação.")
        if original_container["Name"] != f"/{name}":
            docker("rename", original_id, name)
        if not original_container["State"]["Running"]:
            docker("start", original_id)
        wait_health(original_id, name)
    storage, kong = map(inspect, target.services)
    verify_ports(target, storage, kong)
    verify_volume(target, storage)
    require(kong_signatures(kong["Id"]) == state["kong_before"], "Arquivos anteriores do Kong divergentes.")
    require(protected_services(target) == state["protected"], "Banco, Auth ou REST mudou durante a operação.")
    gateway(target, fixture, transformed=False, digest=state["digest"], token=token)
    require(probe(target.network, "-e", PROBE, "outside", storage_name, allow_failure=True) is not None,
            "Sonda externa falhou após reversão.")
    print("Reversão verificada: IDs, saúde, portas, arquivos do Kong, acesso e original.", flush=True)


class InjectedFailure(OperationError):
    pass


def activate(target, directory, fixture, *, inject_failure=False):
    storage, kong, tar, previous, expected = preflight(target)
    digest, token = gateway(target, fixture, transformed=False)
    state = {"marker": secrets.token_hex(16), "originals": [storage["Id"], kong["Id"]], "kong_before": previous,
             "protected": protected_services(target), "digest": digest}
    storage_name, kong_name = target.services
    write_state(directory, state)
    try:
        storage_env = env_dict(storage)
        overrides = (LOCAL_DIR / "audit-storage-transforms.env").read_text().splitlines()
        storage_env.update(line.split("=", 1) for line in overrides)
        kong_env = env_dict(kong)
        kong_env.update(KONG_PLUGINS="request-transformer,cors,response-transformer",
                        KONG_PROXY_ACCESS_LOG="off", KONG_PROXY_ERROR_LOG="/dev/null")
        candidates = [
            create_candidate(f"{name}-imgproxy-candidate", replacement(container, env, target.network, state["marker"]))
            for name, container, env in ((storage_name, storage, storage_env), (kong_name, kong, kong_env))
        ]
        storage_id, kong_id = candidates
        engine(f"/containers/{kong_id}/archive?path={KONG_DIR}&copyUIDGID=false&noOverwriteDirNonDir=true",
               "PUT", tar, "application/x-tar")
        require(kong_signatures(kong_id) == expected, "Arquivos candidatos do Kong divergentes.")
        require(all(inspect(container_id)["State"]["Status"] == "created" for container_id in candidates),
                "Candidatos precisam estar parados antes da troca.")
        require([inspect(name)["Id"] for name in target.services] == state["originals"] and
                kong_signatures(kong["Id"]) == previous, "Originais mudaram durante a preparação.")
        print("Candidatos parados. SHA-256, UID, GID e modo dos arquivos Kong verificados.", flush=True)
        for name, original_id in reversed(list(zip(target.services, state["originals"]))):
            docker("stop", original_id)
            docker("rename", original_id, f"{name}-before-imgproxy")
        for name, candidate_id in zip(target.services, candidates):
            docker("rename", candidate_id, name)
        docker("start", storage_id)
        wait_health(storage_id, "Storage candidato")
        sidecar(target, storage_id, state["marker"])
        docker("start", kong_id)
        wait_health(kong_id, "Kong candidato")
        if inject_failure:
            raise InjectedFailure("Falha simulada após iniciar os candidatos e antes do aceite do gateway.")
        verify_ports(target, inspect(storage_id), inspect(kong_id))
        verify_volume(target, inspect(storage_id))
        require(kong_signatures(kong_id) == expected, "Inicialização do Kong alterou os arquivos candidatos.")
        gateway(target, fixture, transformed=True, digest=digest)
        require(protected_services(target) == state["protected"], "Banco, Auth ou REST mudou durante a operação.")
        print("Ativação verificada: gateway, isolamento, transformação, cache e original.", flush=True)
    except BaseException:
        print("Ativação interrompida. Iniciando reversão.", file=sys.stderr, flush=True)
        try:
            rollback(target, directory, fixture, token)
        except Exception as error:
            detail = str(error) if isinstance(error, OperationError) else type(error).__name__
            raise OperationError(f"Reversão requer intervenção. Registro preservado em {directory}. {detail}") from None
        (directory / "state.json").unlink()
        raise


@contextmanager
def local_lock():
    directory = Path(f"/tmp/gaucha-aud-imgproxy-{os.getuid()}")
    directory.mkdir(mode=0o700, exist_ok=True)
    require(directory.is_dir() and not directory.is_symlink() and directory.stat().st_uid == os.getuid() and
            stat.S_IMODE(directory.stat().st_mode) == 0o700, "Diretório privado inválido.")
    with (directory / "lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise OperationError("Outra operação do AUD-IMG-02 está em andamento.") from None
        yield directory


def interrupt(signum, _frame):
    raise OperationError(f"Operação interrompida por sinal {signum}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("preflight", "activate", "rollback"))
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--approve-local", action="store_true")
    args = parser.parse_args()
    require(args.action == "preflight" or args.approve_local, "Operação requer --approve-local.")
    fixture = load_fixture(args.fixture)
    with local_lock() as directory:
        state = directory / "local"
        if args.action == "preflight":
            preflight(LOCAL)
            print("Inventário, sonda e preparação em memória do Kong verificados.")
        elif args.action == "activate":
            state.mkdir(mode=0o700, exist_ok=True)
            require(not (state / "state.json").exists(),
                    "Existe registro de uma ativação anterior. Execute rollback antes de prosseguir.")
            activate(LOCAL, state, fixture)
        else:
            require((state / "state.json").is_file(), "Registro privado de ativação ausente.")
            rollback(LOCAL, state, fixture)
            (state / "state.json").unlink()


if __name__ == "__main__":
    os.umask(0o077)
    signal.signal(signal.SIGTERM, interrupt)
    signal.signal(signal.SIGINT, interrupt)
    try:
        main()
    except OperationError as error:
        sys.exit(str(error))
    except Exception as error:
        sys.exit(f"Operação interrompida ({type(error).__name__}).")
