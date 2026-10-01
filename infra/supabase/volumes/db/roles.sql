-- Reduced upstream role initialization: only REST, Auth and Storage.
-- Suppress statement logging before handling secrets. No production mode.
set log_statement = none;
set log_min_error_statement = panic;
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
