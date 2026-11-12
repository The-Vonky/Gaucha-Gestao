#!/bin/sh
set -eu
umask 077

# Only JWT/API key alphabets can enter the Lua expression and YAML scalar.
for key in "$SUPABASE_ANON_KEY" "$SUPABASE_SERVICE_KEY" "$SUPABASE_PUBLISHABLE_KEY" "$SUPABASE_SECRET_KEY"; do
  case "$key" in *[!A-Za-z0-9_.-]*) exit 1 ;; esac
done

# Preserve session JWTs and translate the existing CLI opaque keys on adoption.
expression="\$((headers.authorization ~= nil and headers.authorization:sub(1, 10) ~= 'Bearer sb_' and headers.authorization)"
if [ -n "$SUPABASE_SECRET_KEY" ]; then
  expression="$expression or (headers.apikey == '$SUPABASE_SECRET_KEY' and 'Bearer $SUPABASE_SERVICE_KEY')"
fi
if [ -n "$SUPABASE_PUBLISHABLE_KEY" ]; then
  expression="$expression or (headers.apikey == '$SUPABASE_PUBLISHABLE_KEY' and 'Bearer $SUPABASE_ANON_KEY')"
fi
export GG_AUTHORIZATION="$expression or headers.apikey)"
awk '{ gsub(/__GG_AUTHORIZATION__/, ENVIRON["GG_AUTHORIZATION"]); print }' /gg/kong.yml > "$KONG_DECLARATIVE_CONFIG"
unset GG_AUTHORIZATION expression key
exec /docker-entrypoint.sh kong docker-start
