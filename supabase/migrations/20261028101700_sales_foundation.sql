begin;
-- VEN-01: fundação de Vendas / Maquininhas. Contrato aprovado em
-- docs/briefs/VEN-00_consolidada_vendas_maquininhas_2026-10-28.md.
-- Esta migration e seu PR NAO autorizam aplicacao em DEV, STAGING ou PROD.
-- VEN-02 definira RPCs transacionais; ate la, nenhum cliente acessa dados brutos.

create schema sales;
create schema sales_private;
revoke all on schema sales, sales_private from public, anon, authenticated;
alter default privileges in schema sales revoke execute on functions from public;
alter default privileges in schema sales_private revoke execute on functions from public;

-- Capacidades disponiveis no catalogo Core; nao sao concedidas a papeis
-- automaticamente. A matriz papel x capacidade x escopo requer aceite humano.
insert into core.permissions(key,domain,resource,action,description) values
 ('sales.entry.read','sales','entry','read','Consultar lancamentos de vendas autorizados'),
 ('sales.entry.create','sales','entry','create','Cadastrar lancamentos de vendas'),
 ('sales.entry.edit','sales','entry','edit','Corrigir lancamentos autorizados'),
 ('sales.entry.delete','sales','entry','delete','Excluir logicamente lancamentos autorizados'),
 ('sales.dashboard.read','sales','dashboard','read','Consultar indicadores de vendas'),
 ('sales.export.filtered','sales','export','filtered','Exportar recorte autorizado de vendas'),
 ('sales.export.full','sales','export','full','Exportar historico completo autorizado de vendas');

-- Registro de proveniencia para futura importacao. Nenhuma carga real ocorre aqui.
create table sales.import_batches (
 id uuid primary key default gen_random_uuid(),
 source_revision text not null check(length(btrim(source_revision)) between 1 and 160),
 manifest_sha256 text not null check(manifest_sha256 ~ '^[0-9a-f]{64}$'),
 created_by uuid references core.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(source_revision,manifest_sha256)
);

-- NUMERIC sem typmod e CHECK de escala impedem que PostgreSQL arredonde
-- silenciosamente um valor com tres casas antes da validacao (ex.: 1.001).
-- O limite corresponde a 12 algarismos inteiros e 2 casas do legado Numeric(14,2).
create table sales.entries (
 id uuid primary key default gen_random_uuid(),
 sale_date date not null check(isfinite(sale_date)),
 unit_id uuid not null references core.units(id),
 payment_method text not null check(payment_method in ('Stone','PIX')),
 amount numeric not null check(amount>0 and amount<1000000000000 and scale(amount) between 0 and 2),
 source text not null default 'manual' check(source in ('manual','legacy_import')),
 source_ref text unique check(source_ref is null or length(btrim(source_ref)) between 1 and 160),
 import_batch_id uuid references sales.import_batches(id),
 created_by uuid references core.profiles(id) default auth.uid(),
 updated_by uuid references core.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 version integer not null default 1 check(version>=1),
 deleted_by uuid references core.profiles(id),
 deleted_at timestamptz,
 check((deleted_at is null and deleted_by is null) or (deleted_at is not null and deleted_by is not null)),
 check((source='manual' and created_by is not null and source_ref is null and import_batch_id is null)
    or (source='legacy_import' and source_ref is not null and import_batch_id is not null))
);
-- Unicidade so para ativos: preserva excluidos e permite novo UUID com a mesma chave.
create unique index sales_entries_active_unique on sales.entries(sale_date,unit_id,payment_method)
 where deleted_at is null;
create index sales_entries_unit_date on sales.entries(unit_id,sale_date desc) where deleted_at is null;
create index sales_entries_payment_date on sales.entries(payment_method,sale_date desc) where deleted_at is null;
create index sales_entries_deleted on sales.entries(deleted_at desc) where deleted_at is not null;

-- O ajuste nao tem dia; nunca sera distribuido artificialmente na serie diaria.
-- A fonte legada aceita apenas positivos. Residual negativo exige nova decisao
-- humana e eventual migration incremental antes da importacao real (VEN-D12).
create table sales.legacy_monthly_adjustments (
 id uuid primary key default gen_random_uuid(),
 competency date not null check(isfinite(competency) and competency=date_trunc('month',competency)::date),
 unit_id uuid not null references core.units(id),
 payment_method text not null check(payment_method in ('Stone','PIX')),
 amount numeric not null check(amount>0 and amount<1000000000000 and scale(amount) between 0 and 2),
 reason text not null check(length(btrim(reason)) between 1 and 240),
 source_ref text unique check(source_ref is null or length(btrim(source_ref)) between 1 and 160),
 import_batch_id uuid references sales.import_batches(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(competency,unit_id,payment_method),
 check((source_ref is null)=(import_batch_id is null))
);
create index sales_adjustments_unit_month on sales.legacy_monthly_adjustments(unit_id,competency desc);

-- Legado: month_statuses e GLOBAL por competencia, nao por unidade.
-- is_closed=false nao implica necessariamente mes parcial; VEN-03 preserva
-- a formula original e last_day_with_data e dado historico de leitura.
create table sales.month_statuses (
 competency date primary key check(isfinite(competency) and competency=date_trunc('month',competency)::date),
 is_closed boolean not null default false,
 last_day_with_data integer not null default 0 check(
   last_day_with_data between 0 and extract(day from (competency+interval '1 month - 1 day'))::integer
 ),
 source text not null default 'system' check(length(btrim(source)) between 1 and 30),
 source_ref text unique check(source_ref is null or length(btrim(source_ref)) between 1 and 160),
 import_batch_id uuid references sales.import_batches(id),
 created_at timestamptz not null default clock_timestamp(),
 check((source_ref is null)=(import_batch_id is null))
);

-- Operacoes de negocio nao sao liberadas na VEN-01.
-- Guarda de negocio e trilha transacional, acionadas futuramente por RPCs VEN-02.
create function sales_private.guard_entry_mutation() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
   raise exception 'Exclusao fisica proibida' using errcode='55000';
 end if;
 if tg_op='INSERT' then
   if new.deleted_at is not null or new.deleted_by is not null then
     raise exception 'Nao inserir registro ja excluido' using errcode='23514';
   end if;
   if new.source='manual' then
     if auth.uid() is null or new.created_by is distinct from auth.uid()
        or not exists(select 1 from core.units u where u.id=new.unit_id and u.active) then
       raise exception 'Lancamento manual exige autor e unidade ativa' using errcode='42501';
     end if;
   end if;
   new.version:=1;
   new.updated_by:=new.created_by;
   new.updated_at:=new.created_at;
   return new;
 end if;
 if old.deleted_at is not null then
   raise exception 'Registro excluido e imutavel' using errcode='55000';
 end if;
 if new.id is distinct from old.id or new.created_at is distinct from old.created_at
   or new.created_by is distinct from old.created_by or new.source is distinct from old.source
   or new.source_ref is distinct from old.source_ref
   or new.import_batch_id is distinct from old.import_batch_id then
   raise exception 'Metadados de proveniencia sao imutaveis' using errcode='55000';
 end if;
 if auth.uid() is null then
   raise exception 'Correcao exige usuario autenticado' using errcode='42501';
 end if;
 if new.unit_id is distinct from old.unit_id
   and not exists(select 1 from core.units u where u.id=new.unit_id and u.active) then
   raise exception 'Transferencia exige unidade destino ativa' using errcode='23514';
 end if;
 if new.deleted_at is not null and new.deleted_by is distinct from auth.uid() then
   raise exception 'Exclusao deve identificar ator' using errcode='42501';
 end if;
 new.updated_by:=auth.uid();
 new.updated_at:=clock_timestamp();
 new.version:=old.version+1;
 return new;
end $$;
create trigger guard_entry_mutation before insert or update or delete on sales.entries
 for each row execute function sales_private.guard_entry_mutation();

-- Historico importado nao pode ser apagado ou reescrito por atualizacao comum.
-- Uma futura regra de correcao de ajuste precisara de contrato e auditoria proprios.
create function sales_private.forbid_historical_mutation() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'Historico imutavel nesta fase' using errcode='55000';
end $$;
create trigger adjustments_immutable before update or delete on sales.legacy_monthly_adjustments
 for each row execute function sales_private.forbid_historical_mutation();
create trigger month_statuses_immutable before update or delete on sales.month_statuses
 for each row execute function sales_private.forbid_historical_mutation();
create trigger import_batches_immutable before update or delete on sales.import_batches
 for each row execute function sales_private.forbid_historical_mutation();

-- Log de mutacoes append-only com antes/depois no Core; nunca delegar auditoria
-- apenas ao navegador. Transferencia de unidade aparece apenas a auditor global:
-- unit_id=null para nao expor unidade de origem a um auditor unitario do destino.
create function sales_private.audit_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare
 v_before jsonb;
 v_after jsonb;
 v_unit uuid;
 v_action text;
 v_entity text;
 v_id text;
begin
 v_before:=null;
 v_after:=to_jsonb(new);
 v_entity:=tg_table_name;
 if tg_op='UPDATE' then
   v_before:=to_jsonb(old);
 end if;
 if tg_table_name='entries' then
   v_id:=new.id::text;
   v_unit:=new.unit_id;
   if tg_op='INSERT' then
     v_action:='entry.create';
   else
     if old.unit_id is distinct from new.unit_id then
       v_unit:=null;
     end if;
     if new.deleted_at is not null and old.deleted_at is null then
       v_action:='entry.delete';
     else
       v_action:='entry.edit';
     end if;
   end if;
 elsif tg_table_name='legacy_monthly_adjustments' then
   v_id:=new.id::text;
   v_unit:=new.unit_id;
   v_action:='adjustment.import';
 elsif tg_table_name='month_statuses' then
   v_id:=new.competency::text;
   v_unit:=null;
   v_action:='month_status.import';
 else
   v_id:=new.id::text;
   v_unit:=null;
   v_action:='import_batch.create';
 end if;
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,
   unit_id,before_data,after_data)
 values(auth.uid(),'sales',v_action,v_entity,v_id,v_unit,v_before,v_after);
 return new;
end $$;
create trigger entries_audit after insert or update on sales.entries
 for each row execute function sales_private.audit_change();
create trigger adjustments_audit after insert on sales.legacy_monthly_adjustments
 for each row execute function sales_private.audit_change();
create trigger statuses_audit after insert on sales.month_statuses
 for each row execute function sales_private.audit_change();
create trigger import_batches_audit after insert on sales.import_batches
 for each row execute function sales_private.audit_change();

-- Defesa em profundidade: RLS restritiva e nenhum grant de dados ou funcao.
alter table sales.entries enable row level security;
alter table sales.legacy_monthly_adjustments enable row level security;
alter table sales.month_statuses enable row level security;
alter table sales.import_batches enable row level security;
create policy sales_entries_client_deny on sales.entries as restrictive for all
 to anon,authenticated using(false) with check(false);
create policy sales_adjustments_client_deny on sales.legacy_monthly_adjustments as restrictive for all
 to anon,authenticated using(false) with check(false);
create policy sales_statuses_client_deny on sales.month_statuses as restrictive for all
 to anon,authenticated using(false) with check(false);
create policy sales_batches_client_deny on sales.import_batches as restrictive for all
 to anon,authenticated using(false) with check(false);

revoke all on all tables in schema sales from public,anon,authenticated;
revoke all on all sequences in schema sales from public,anon,authenticated;
revoke all on all functions in schema sales_private from public,anon,authenticated;
revoke all on schema sales, sales_private from public,anon,authenticated;

commit;
