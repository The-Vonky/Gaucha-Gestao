#!/usr/bin/env bash
set -euo pipefail
set +x
# shellcheck source=scripts/ops/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
ops_init "$@"
ops_assert_target
failed=0
for service in db auth rest storage kong; do
  id=$("${compose[@]}" ps --all --quiet "$service")
  state=''
  [[ -z $id ]] || state=$(docker inspect --format '{{.State.Status}}:{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id")
  if [[ $state == running:healthy ]]; then
    echo "$service: healthy"
  else
    echo "$service: unavailable/unhealthy" >&2
    failed=1
  fi
done
if [[ $(ops_sql -Atqc "select not pg_is_in_recovery() and current_setting('server_version_num')::int / 10000 = 17") != t ]]; then
  echo 'PostgreSQL: unexpected major/read-only recovery state' >&2
  failed=1
fi
# Active probes reach each HTTP dependency THROUGH the gateway, not just a process.
if ! "${compose[@]}" exec -T storage node -e '
  (async()=>{
    const key=process.env.SERVICE_KEY;
    for(const path of ["/auth/v1/health","/rest/v1/","/storage/v1/status"]){
      const r=await fetch("http://kong:8000"+path,{headers:{apikey:key,Authorization:"Bearer "+key},signal:AbortSignal.timeout(5000)});
      if(!r.ok) throw new Error("gateway dependency unavailable");
    }
  })().catch(()=>{console.error("Gateway active probe failed");process.exit(1)});
'; then
  failed=1
fi
# Minimum free bytes/inodes on both persisted data paths, plus actual file write.
for entry in 'db /var/lib/postgresql/data' 'storage /var/lib/storage'; do
  read -r service path <<< "$entry"
  # Expand data-path variables inside the container shell, not on the host.
  # shellcheck disable=SC2016
  if ! "${compose[@]}" exec -T "$service" sh -c '
    bytes=$(df -Pk "$1" | awk "NR==2 {print \$4}")
    inodes=$(df -Pi "$1" | awk "NR==2 {print \$4}")
    [ "$bytes" -ge 102400 ] && [ "$inodes" -ge 100 ] && [ -w "$1" ]
  ' sh "$path"; then
    echo "$service: data path lacks free space/inodes or write permission" >&2
    failed=1
  fi
done
if ! "${compose[@]}" exec -T storage node -e '
 const fs=require("fs");const p="/var/lib/storage/.health-"+require("crypto").randomUUID();
 try{fs.writeFileSync(p,"health",{flag:"wx"});fs.unlinkSync(p)}catch{console.error("Storage file write failed");process.exit(1)}
'; then failed=1; fi
exit "$failed"
