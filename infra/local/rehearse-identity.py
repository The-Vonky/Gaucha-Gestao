#!/usr/bin/env python3
"""Executa a prova de identidade no Compose vazio e descartável da CI."""
from pathlib import Path
import os
import re
import runpy
import secrets
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def main():
    project = os.environ.get("GG_IDENTITY_CI_PROJECT", "")
    if (os.environ.get("CI") != "true" or os.environ.get("GITHUB_ACTIONS") != "true"
            or not re.fullmatch(r"gg-identity-ci-\d+-\d+", project)):
        raise SystemExit("Use exclusivamente o runner de CI descartável.")
    temporary = Path(os.environ["RUNNER_TEMP"]).resolve(strict=True)
    credentials = temporary / "gg-identity-ci.env"
    identity = temporary / "gg-identity-runtime-ci.env"
    local = runpy.run_path(str(HERE / "local-dev.py"))
    local["generate"](credentials, [54321, 54322, 54323])
    db_password = secrets.token_hex(32)
    local["private_file"](identity, (
        f"GG_IDENTITY_DATABASE_URL=postgres://gg_identity:{db_password}@db:5432/postgres\n"
    ).encode())
    base = ["docker", "compose", "-p", project, "--env-file", str(credentials),
            "-f", str(HERE / "compose.yaml")]
    strict = base + ["--env-file", str(identity), "-f", str(HERE / "compose.identity.yaml")]
    subprocess.run(strict + ["config", "--quiet"], check=True)
    subprocess.run(base + ["up", "-d", "--build", "--wait", "db", "storage", "auth"], check=True)
    for migration in local["migrations"]():
        local["sql"](credentials, project, migration.read_text())
    local["sql"](credentials, project, f"alter role gg_identity login password '{db_password}';")
    subprocess.run(strict + ["up", "-d", "--build", "--wait", "kong"], check=True)
    local["sql"](credentials, project, "update private.identity_settings set enabled=true;")
    env = {**os.environ, "GG_IDENTITY_TEST_ANON_KEY": local["private_values"](credentials)["ANON_KEY"]}
    for suite in ("gg05b-identity.mjs", "action-plans-delegation.mjs"):
        subprocess.run(["node", str(ROOT / "tests/integration" / suite), project], env=env, check=True)


if __name__ == "__main__":
    main()
