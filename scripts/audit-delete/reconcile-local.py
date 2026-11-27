"""Reconciliação do backend file v1.72.1, exclusivamente no Compose pessoal."""
import argparse
import json
import os
from pathlib import Path
import subprocess
from uuid import UUID

PROJECT = "gaucha-gestao-local"
DB = PROJECT + "-db-1"
STORAGE = PROJECT + "-storage-1"
IMAGE = "sha256:105a2584129c9600aebed6f5ac49ca4371c92b996ecd1af7179750333e9e2120"


def run(*args, data=None):
    return subprocess.run(["docker", *args], input=data, text=True,
                          capture_output=True, check=True).stdout.strip()


def sql(query):
    return run("exec", "-i", DB, "psql", "-XqAt", "-v", "ON_ERROR_STOP=1",
               "-U", "postgres", "-d", "postgres", data=query)


def reconcile(target, apply, plan):
    endpoint = os.getenv("DOCKER_HOST") or run("context", "inspect", "--format",
                                                 "{{.Endpoints.docker.Host}}")
    if not endpoint.startswith("unix://"):
        raise ValueError("O daemon Docker deve ser local.")
    for container, service in [(DB, "db"), (STORAGE, "storage")]:
        label = run("inspect", "-f", '{{index .Config.Labels "com.docker.compose.project"}}/{{index .Config.Labels "com.docker.compose.service"}}', container)
        if label != PROJECT + "/" + service:
            raise ValueError("Projeto ou serviço divergente.")
    if not run("inspect", "-f", "{{.Config.Image}}", STORAGE).endswith("@" + IMAGE):
        raise ValueError("Revalide a implementação física para esta imagem.")
    # Só o UUID canônico chega ao SQL. Os namespaces vêm do inventário congelado.
    table, column, objects = (
        ("action_plans_private.plan_deletions", "plan_id", "action_plans_private.plan_storage_objects")
        if plan else
        ("audit_private.inspection_deletions", "inspection_id", "audit_private.inspection_storage_objects")
    )
    job = f"""from {table} j
      where j.{column}='{target}' and j.reconciliation_required
      and j.completed_at is null and not exists
        (select from {objects}(j.{column}))"""
    scopes = sql(f"""select jsonb_agg(jsonb_build_array(n.bucket,n.prefix) order by n.bucket,n.prefix)
      from audit_private.deletion_namespaces n where n.{column} in (select j.{column} {job});""")
    if not scopes or not json.loads(scopes):
        raise ValueError("Retome o lote na aplicação. É necessária uma operação pendente sem objetos catalogados.")
    program = Path(__file__).with_name("reconcile-storage.mjs").read_text()
    result = run("exec", "-i", STORAGE, "node", "--input-type=module", "-e", program,
                 data=json.dumps({"scopes": json.loads(scopes), "apply": apply}))
    proof = json.loads(result.splitlines()[-1])
    print(f"Versões físicas encontradas: {proof['found']}. Restantes: {proof['remaining']}.")
    if apply and proof["remaining"] == 0:
        verified = sql(f"""update {table} set verified_at=clock_timestamp()
          where {column} in (select j.{column} {job}) returning 'verified';""")
        if verified != "verified":
            raise ValueError("Estado alterado. Repita a conferência.")
        print("Verificação física registrada. Retome a exclusão na aplicação.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("alvo", type=UUID, help="UUID da auditoria ou do plano de ação")
    parser.add_argument("--plan", action="store_true", help="reconciliar a exclusão de um plano de ação")
    parser.add_argument("--apply", action="store_true", help="remover versões órfãs confirmadas e verificar")
    args = parser.parse_args()
    try:
        reconcile(str(args.alvo), args.apply, args.plan)
    except subprocess.CalledProcessError:
        raise SystemExit("Verificação interrompida. Confira tráfego ativo, caminhos ambíguos e serviços. A operação permanece pendente.") from None
