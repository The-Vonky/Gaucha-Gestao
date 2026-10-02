#!/usr/bin/env bash
set -euo pipefail
set +x
# CI/staging only. Requires an existing directory outside ANY Git checkout.
if [[ $# != 4 || $1 != --environment || $3 != --output ]]; then
  echo 'Usage: gen-secrets.sh --environment ci|staging --output /absolute/external/file.env' >&2
  exit 2
fi
case "$2" in ci|staging) ;; *) echo 'Unsupported environment' >&2; exit 2 ;; esac
[[ $4 == /* ]] || { echo 'Output must be absolute' >&2; exit 2; }
repo_root=$(git -C "$(dirname "${BASH_SOURCE[0]}")/../.." rev-parse --show-toplevel)
target=$(realpath -m -- "$4")
parent=$(dirname "$target")
[[ -d $parent ]] || { echo 'Output directory must already exist' >&2; exit 2; }
case "$target/" in "$repo_root/"*) echo 'Secrets must be outside the repository' >&2; exit 2 ;; esac
if git -C "$parent" rev-parse --show-toplevel >/dev/null 2>&1; then
  echo 'Secrets must be outside every Git checkout' >&2
  exit 2
fi
umask 077
node --input-type=module - "$2" "$target" <<'JS'
import { randomBytes, createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const [environment, target] = process.argv.slice(2);
const secret = randomBytes(48).toString('hex');
const issued = Math.floor(Date.now() / 1000);
const jwt = role => {
  const head = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const body = Buffer.from(JSON.stringify({role,iss:'supabase',iat:issued,exp:issued+3600})).toString('base64url');
  return `${head}.${body}.${createHmac('sha256',secret).update(`${head}.${body}`).digest('base64url')}`;
};
const values = {
  INFRA_ENVIRONMENT: environment,
  INFRA_INSTANCE_ID: randomBytes(16).toString('hex'),
  GATEWAY_PORT: '54321',
  SITE_URL: 'http://localhost:5173',
  API_EXTERNAL_URL: 'http://127.0.0.1:54321',
  ADDITIONAL_REDIRECT_URLS: 'http://localhost:5173',
  POSTGRES_PASSWORD: randomBytes(32).toString('hex'),
  JWT_SECRET: secret,
  ANON_KEY: jwt('anon'),
  SERVICE_ROLE_KEY: jwt('service_role'),
};
try {
  writeFileSync(target, Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n', {flag:'wx',mode:0o600});
} catch {
  console.error('Cannot create secrets file (existing files are never overwritten)');
  process.exit(1);
}
JS
# Never print a path's contents, passwords, signing material or API keys.
echo 'Ephemeral secrets generated (API keys expire in one hour).'
