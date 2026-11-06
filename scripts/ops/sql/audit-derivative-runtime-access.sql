-- Proposta revisável. Bootstrap autorizado SOMENTE após GO C; CI usa o mesmo arquivo.
-- Pré-condição: login audit_derivative_worker criado separadamente, sem memberships.
-- Não cria senha/login; colisão de role Storage falha em vez de ampliar identidade existente.
begin;
create role audit_derivative_storage_runtime nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant audit_derivative_storage_runtime to supabase_storage_admin with inherit false, set true;
grant connect on database postgres to audit_derivative_worker;
grant usage on schema audit_private to audit_derivative_worker;
grant execute on function audit_private.runtime_derivative_claim(uuid),
 audit_private.runtime_derivative_prepare(uuid,jsonb),audit_private.runtime_derivative_complete(uuid),
 audit_private.runtime_derivative_fail(uuid),audit_private.runtime_derivative_scope(uuid,text) to audit_derivative_worker;
grant usage on schema storage,auth,audit_private to audit_derivative_storage_runtime;
grant select on storage.buckets,storage.objects to audit_derivative_storage_runtime;
grant insert on storage.objects to audit_derivative_storage_runtime;
grant execute on function audit_private.runtime_derivative_object(text,text) to audit_derivative_storage_runtime;
create policy derivative_runtime_bucket on storage.buckets for select to audit_derivative_storage_runtime
using(id in ('audit-checklist-evidence','audit-evidence-thumbnails'));
create policy derivative_runtime_read on storage.objects for select to audit_derivative_storage_runtime
using(current_setting('storage.operation',true)='storage.object.get_authenticated' and audit_private.runtime_derivative_object(bucket_id,name));
create policy derivative_runtime_insert on storage.objects for insert to audit_derivative_storage_runtime
with check(bucket_id='audit-evidence-thumbnails' and current_setting('storage.operation',true)='storage.object.upload'
 and audit_private.runtime_derivative_object(bucket_id,name));
commit;
