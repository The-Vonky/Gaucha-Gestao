#!/usr/bin/env python3
"""Prepara o snapshot e os payloads locais em /tmp. Só faz leituras no Docker."""

import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

import yaml


PROJECT = "gaucha-gestao-local"
NETWORK = f"{PROJECT}-loopback"
STORAGE = f"supabase_storage_{PROJECT}"
KONG = f"supabase_kong_{PROJECT}"
STORAGE_IMAGE = "sha256:105a2584129c9600aebed6f5ac49ca4371c92b996ecd1af7179750333e9e2120"
KONG_DIR = "/home/kong"
KONG_FILES = ("kong.yml", "localhost.crt", "localhost.key")


def docker(*args):
    return subprocess.check_output(["docker", *args], stderr=subprocess.DEVNULL)


def require(condition):
    if not condition:
        raise ValueError("Runtime diferente do inventário aprovado para o plano.")


def env_dict(container):
    return dict(entry.split("=", 1) for entry in container["Config"]["Env"])


def replacement(container, env):
    config = container["Config"].copy()
    config.pop("Hostname", None)
    config["Image"] = container["Image"]
    config["Env"] = [f"{key}={value}" for key, value in env.items()]
    config["HostConfig"] = {**container["HostConfig"], "LogConfig": {"Type": "none", "Config": {}}}
    config["NetworkingConfig"] = {
        "EndpointsConfig": {NETWORK: {"Aliases": container["NetworkSettings"]["Networks"][NETWORK]["Aliases"]}}
    }
    return config


def no_store_on_storage(declarative):
    service, = (service for service in declarative["services"] if service["name"] == "storage-v1")
    route, = (route for route in service["routes"] if route["paths"] == ["/storage/v1/"])
    plugins = route.setdefault("plugins", [])
    require(all(plugin["name"] != "response-transformer" for plugin in plugins))
    plugins.append({
        "name": "response-transformer",
        "config": {
            "remove": {"headers": ["Cache-Control", "Expires"]},
            "add": {"headers": ["Cache-Control:private, no-store"]},
        },
    })


def prepare():
    storage, kong = json.loads(docker("inspect", STORAGE, KONG))
    for container in (storage, kong):
        require(container["State"]["Health"]["Status"] == "healthy")
        require(container["Config"]["Labels"]["com.supabase.cli.project"] == PROJECT)
        require(list(container["NetworkSettings"]["Networks"]) == [NETWORK])
        require(container["HostConfig"]["NetworkMode"] == NETWORK)
        require(not container["HostConfig"]["PublishAllPorts"])
    require(storage["Image"] == STORAGE_IMAGE)
    require(storage["HostConfig"]["Binds"] == [f"{STORAGE}:/mnt"])
    require(not storage["HostConfig"]["PortBindings"] and not kong["Mounts"])
    require(kong["Config"]["Image"] == "public.ecr.aws/supabase/kong:2.8.1")
    require(kong["NetworkSettings"]["Ports"] == {"8000/tcp": [
        {"HostIp": "127.0.0.1", "HostPort": "54321"}, {"HostIp": "::1", "HostPort": "54321"},
    ]})
    network = json.loads(docker("network", "inspect", NETWORK))[0]
    require(network["Options"]["com.docker.network.bridge.host_binding_ipv4"] == "127.0.0.1")

    storage_env = env_dict(storage)
    require(storage_env["STORAGE_BACKEND"] == "file" and storage_env["FILE_STORAGE_BACKEND_PATH"] == "/mnt")
    require(all(storage_env[key] == "false" for key in ("ENABLE_IMAGE_TRANSFORMATION", "IMAGE_TRANSFORMATION_ENABLED")))
    overrides = Path(__file__).with_name("audit-storage-transforms.env").read_text().splitlines()
    storage_env.update(line.split("=", 1) for line in overrides)

    kong_env = env_dict(kong)
    require(kong_env["KONG_PLUGINS"] == "request-transformer,cors")
    kong_env.update(KONG_PLUGINS="request-transformer,cors,response-transformer",
                    KONG_PROXY_ACCESS_LOG="off", KONG_PROXY_ERROR_LOG="/dev/null")
    docker("exec", KONG, "test", "-r", "/usr/local/share/lua/5.1/kong/plugins/response-transformer/handler.lua")
    files = {name: docker("exec", KONG, "cat", f"{KONG_DIR}/{name}") for name in KONG_FILES}
    ownership = {name: docker("exec", KONG, "stat", "-c", "%u %g %a", f"{KONG_DIR}/{name}").split()
                 for name in KONG_FILES}
    declarative = yaml.safe_load(files["kong.yml"])
    no_store_on_storage(declarative)

    directory = Path(tempfile.mkdtemp(prefix="gaucha-aud-imgproxy-"))
    try:
        (directory / "before.json").write_text(json.dumps([storage, kong]))
        (directory / "kong-before.yml").write_bytes(files["kong.yml"])
        (directory / "storage-create.json").write_text(json.dumps(replacement(storage, storage_env)))
        (directory / "kong-create.json").write_text(json.dumps(replacement(kong, kong_env)))
        files["kong.yml"] = yaml.safe_dump(declarative, sort_keys=False).encode()
        with tarfile.open(directory / "kong-files.tar", "w") as archive:
            for name, data in files.items():
                uid, gid, mode = ownership[name]
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                entry.uid, entry.gid, entry.mode = int(uid), int(gid), int(mode, 8)
                archive.addfile(entry, io.BytesIO(data))
        (directory / "container-ids").write_text(f'{storage["Id"]}\n{kong["Id"]}\n')
    except Exception:
        shutil.rmtree(directory)
        raise
    return directory


if __name__ == "__main__":
    try:
        # Inspeções, declarativo e certificados podem conter credenciais.
        os.umask(0o077)
        print(prepare())
    except Exception:
        sys.exit("Pré-voo interrompido. Confira Docker, PyYAML e a correspondência com o inventário local.")
