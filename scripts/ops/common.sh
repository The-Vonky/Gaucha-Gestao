#!/usr/bin/env bash
# Shared explicit target contract. Do not source an env file as shell code.
set -euo pipefail
set +x
ops_fail() { echo "$1" >&2; exit 2; }
ops_init() {
  [[ $# == 8 && $1 == --environment && $3 == --env-file && $5 == --project && $7 == --database ]] ||
    ops_fail 'Required: --environment ci|staging --env-file /external/file.env --project gaucha-infra-NAME --database postgres'
  environment=$2
  env_file=$4
  project=$6
  database=$8
  case "$environment" in ci|staging) ;; *) ops_fail 'Unsupported environment' ;; esac
  [[ $project =~ ^gaucha-infra-[a-z0-9][a-z0-9-]*$ ]] || ops_fail 'Explicit isolated project name required'
  [[ $database == postgres ]] || ops_fail 'Only the Compose postgres database is supported'
  [[ $env_file == /* && -f $env_file ]] || ops_fail 'Absolute env file required'
  repo_root=$(git -C "$(dirname "${BASH_SOURCE[0]}")/../.." rev-parse --show-toplevel)
  env_file=$(realpath -- "$env_file")
  case "$env_file/" in "$repo_root/"*) ops_fail 'Real env files must be outside the repository' ;; esac
  [[ $(stat -c '%a' "$env_file") == 600 ]] || ops_fail 'Env file must have mode 600'
  local key value
  while IFS='=' read -r key value; do
    [[ -z $key || $key == \#* ]] && continue
    case "$key" in
      INFRA_ENVIRONMENT|INFRA_INSTANCE_ID|GATEWAY_PORT|SITE_URL|API_EXTERNAL_URL|ADDITIONAL_REDIRECT_URLS|POSTGRES_PASSWORD|JWT_SECRET|ANON_KEY|SERVICE_ROLE_KEY)
        [[ -n $value && $value != *REPLACE_* && $value != *$'\r'* ]] || ops_fail 'Empty/placeholder/CRLF env value'
        export "$key=$value" ;;
      *) ops_fail 'Unexpected env key' ;;
    esac
  done < "$env_file"
  [[ ${INFRA_ENVIRONMENT:-} == "$environment" ]] || ops_fail 'Environment mismatch'
  [[ ${INFRA_INSTANCE_ID:-} =~ ^[a-f0-9]{32}$ ]] || ops_fail 'Missing fresh instance marker'
  [[ ${POSTGRES_PASSWORD:-} =~ ^[a-f0-9]{64}$ && ${JWT_SECRET:-} =~ ^[a-f0-9]{96}$ ]] || ops_fail 'Use gen-secrets.sh credentials'
  [[ ${ANON_KEY:-} =~ ^[A-Za-z0-9._-]+$ && ${SERVICE_ROLE_KEY:-} =~ ^[A-Za-z0-9._-]+$ ]] || ops_fail 'Invalid API keys'
  [[ ${GATEWAY_PORT:-} =~ ^[0-9]{4,5}$ && $GATEWAY_PORT -ge 1024 && $GATEWAY_PORT -le 65535 ]] || ops_fail 'Invalid gateway port'
  [[ ${SITE_URL:-} =~ ^https?:// && ${API_EXTERNAL_URL:-} =~ ^https?:// && -n ${ADDITIONAL_REDIRECT_URLS:-} ]] || ops_fail 'Explicit URLs required'
  compose=(docker compose --env-file "$env_file" --project-name "$project" -f "$repo_root/infra/supabase/docker-compose.yml")
  unset COMPOSE_FILE COMPOSE_PROFILES
}
ops_sql() { "${compose[@]}" exec -T db psql -X -v ON_ERROR_STOP=1 -h localhost -U supabase_admin -d "$database" "$@"; }
ops_assert_target() {
  local target
  target=$(ops_sql -Atqc 'select environment||chr(58)||instance_id from infra_control.target') || ops_fail 'Cannot verify isolated DB marker'
  [[ $target == "$environment:$INFRA_INSTANCE_ID" ]] || ops_fail 'DB target mismatch; refusing operation'
}
