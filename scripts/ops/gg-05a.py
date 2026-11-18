"""Diagnóstico de estrutura da GG-05A no notebook. Não recebe dados de usuários."""
import argparse
from os import getuid
from pwd import getpwuid
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

PROJECT = "gaucha-gestao-local"
ROOT = Path(__file__).resolve().parents[2]
CATALOG = """
select case when exists (
  select from pg_trigger where tgrelid='auth.users'::regclass
  and tgname='create_core_profile' and tgfoid='private.create_profile()'::regprocedure
  and tgenabled in ('O','A') and tgtype=5 and tgqual is null
) and exists (
  select from pg_constraint c where c.contype='f' and c.convalidated
  and c.conrelid='core.profiles'::regclass and c.confrelid='auth.users'::regclass
  and c.conkey=array[(select attnum from pg_attribute where attrelid=c.conrelid and attname='id')]
  and c.confkey=array[(select attnum from pg_attribute where attrelid=c.confrelid and attname='id')]
) then 'vinculo-ok' else 'vinculo-divergente' end;
select version from supabase_migrations.schema_migrations order by version;
"""


def docker(*args, sql=None):
    # O socket e o projeto são fixos. Não carregar .env nem imprimir stderr do daemon.
    return subprocess.run(
        ["docker", "--host", "unix:///var/run/docker.sock", *args],
        input=sql, text=True, capture_output=True, check=True, timeout=15,
        env={"PATH": "/usr/local/bin:/usr/bin:/bin"},
    ).stdout.strip()


def inspect_local():
    label = 'index .Config.Labels "com.docker.compose.'
    fmt = '{{.Id}} {{' + label + 'project"}} {{' + label + 'service"}} {{.State.Running}}'
    container, project, service, running = docker(
        "inspect", "--type", "container", "--format", fmt, PROJECT + "-db-1"
    ).split()
    if (project, service, running) != (PROJECT, "db", "true"):
        raise ValueError("destino")
    rows = docker(
        "exec", "-i", container, "psql", "-XqAt", "-v", "ON_ERROR_STOP=1",
        "-U", "postgres", "-d", "postgres",
        sql="begin isolation level repeatable read read only;\n"
            "set local statement_timeout='5s';\n" + CATALOG + "\nrollback;",
    ).splitlines()
    ledger = sorted(p.name.split("_", 1)[0] for p in (ROOT / "supabase/migrations").glob("*.sql"))
    if not ledger or rows != ["vinculo-ok", *ledger]:
        raise ValueError("estrutura")
    print(f"PASS estrutura local: trigger e FK presentes, {len(ledger)} versões no ledger; última {ledger[-1]}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verificar-local", action="store_true",
                        help="consultar catálogos e ledger pelo socket Docker local")
    args = parser.parse_args()
    if not args.verificar_local:
        print("SIMULAÇÃO offline. Nenhuma conexão. Ver runbook GG-05A para conferir operador, alvo e escopo.")
        return 0
    try:
        if not sys.stdin.isatty() or input(
            f"Operador local {getpwuid(getuid()).pw_name}. Digite {PROJECT} para confirmar a leitura de estrutura: "
        ) != PROJECT:
            print("BLOCKED confirmação ausente.")
            return 2
        print(datetime.now(timezone.utc).isoformat(timespec="seconds"))
        inspect_local()
    except (EOFError, OSError, ValueError, subprocess.SubprocessError):
        print("BLOCKED verificação incompleta. Conferir socket, projeto, serviço, trigger, FK e ledger.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
