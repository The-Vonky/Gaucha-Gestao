-- Executado pelo entrypoint da imagem somente em PGDATA novo.
set log_statement = none;
set log_min_error_statement = panic;
\getenv pgpass POSTGRES_PASSWORD
alter role postgres password :'pgpass';
alter role authenticator password :'pgpass';
alter role supabase_auth_admin password :'pgpass';
alter role supabase_storage_admin password :'pgpass';
alter database postgres set "app.settings.jwt_exp" to '3600';
