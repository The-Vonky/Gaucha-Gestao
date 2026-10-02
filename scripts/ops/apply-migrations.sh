#!/usr/bin/env bash
set -euo pipefail
set +x
# shellcheck source=scripts/ops/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
ops_init "$@"
ops_assert_target
# Single first application only. No reset/drop/replay mode; never silently reapply.
exists=$(ops_sql -Atqc "select to_regnamespace('core') is not null or to_regclass('infra_control.migrations') is not null")
[[ $exists == f ]] || ops_fail 'Migrations require a fresh initialized stack; existing application DB refused'
files=("$repo_root"/supabase/migrations/*.sql)
[[ -f ${files[0]} ]] || ops_fail 'No application migrations found'
[[ $(ops_app_sql -Atqc 'select current_user') == postgres ]] || ops_fail 'Application migrations require postgres authentication'
# Existing files own their BEGIN/COMMIT. Execute them byte-for-byte in order.
# A partial failure requires a NEW disposable stack; replay/reset is never implicit.
ops_sql -q -c 'create table infra_control.migrations(version text primary key, sha256 text not null); revoke all on infra_control.migrations from public, anon, authenticated;' >/dev/null
for file in "${files[@]}"; do
  name=$(basename "$file")
  [[ $name =~ ^[0-9]+_[a-zA-Z0-9_]+\.sql$ ]] || ops_fail 'Unexpected migration filename'
  hash=$(sha256sum "$file" | cut -d ' ' -f1)
  ops_app_sql -q < "$file" >/dev/null
  ops_sql -q -c "insert into infra_control.migrations values ('$name','$hash');" >/dev/null
done
ops_app_sql -q -c "notify pgrst, 'reload schema';" >/dev/null
echo "Applied ${#files[@]} existing application migrations to the explicit fresh target."
