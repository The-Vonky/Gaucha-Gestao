-- VEN-01: cenarios sintéticos; executado apenas no PostgreSQL/PGlite isolado em memoria.
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-0000-0000-000000000001','sales-admin@example.test',now()),
 ('00000000-0000-0000-0000-000000000002','sales-operator@example.test',now());
select private.bootstrap_administrator('00000000-0000-0000-0000-000000000001');
insert into core.units(id,code,name,active) values
 ('10000000-0000-0000-0000-000000000001','VEN-A','Unidade A',true),
 ('10000000-0000-0000-0000-000000000002','VEN-B','Unidade B',false);

create function public.ven01_assert(ok boolean, context text) returns void
language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'VEN-01 assertion failed: %',context; end if;
end $$;
create function public.ven01_error(command text, expected text) returns void
language plpgsql as $$
begin
 begin
  execute command;
 exception when others then
  if sqlstate=expected then return; end if;
  raise exception 'Esperado SQLSTATE %, recebido %: %',expected,sqlstate,sqlerrm;
 end;
 raise exception 'Esperado erro %, mas comando passou: %',expected,command;
end $$;

select public.ven01_assert(
 (select count(*)=4 and bool_and(c.relrowsecurity)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='sales' and c.relkind='r'),
 'RLS deve estar ativa nas quatro tabelas'
);
select public.ven01_assert(
 (select count(*)=7 from core.permissions where domain='sales'),
 'Catalogo de sete capacidades'
);
select public.ven01_assert(
 (select count(*)=0 from core.role_permissions rp where rp.permission_key like 'sales.%'),
 'Nenhuma permissao de vendas concedida automaticamente'
);
select public.ven01_assert(
 (select count(*)=0 from pg_roles r where r.rolname like 'sales_%'),
 'Nenhum papel criado para concessao automatica'
);

-- Importacao sintética, sem identidade original falsa, inclusive unidade hoje inativa.
insert into sales.import_batches(source_revision,manifest_sha256)
 values('fonte-sintetica-v1',repeat('a',64));
insert into sales.entries(sale_date,unit_id,payment_method,amount,source,source_ref,import_batch_id)
select '2026-02-03','10000000-0000-0000-0000-000000000002','Stone',12.34,
 'legacy_import','legado-entrada-1',id from sales.import_batches;
select public.ven01_assert(
 (select count(*)=1 from sales.entries where source='legacy_import' and created_by is null),
 'Autoria historica desconhecida permanece nula'
);
select public.ven01_assert(
 (select count(*)=2 from core.system_audit_log
  where module='sales' and actor_user_id is null),
 'Auditoria de lote e entrada nao inventa autor'
);

insert into sales.legacy_monthly_adjustments(competency,unit_id,payment_method,amount,reason,source_ref,import_batch_id)
select '2026-02-01','10000000-0000-0000-0000-000000000002','Stone',0.01,
 'Ajuste legado de um centavo','legado-ajuste-1',id from sales.import_batches;
insert into sales.month_statuses(competency,is_closed,last_day_with_data,source,source_ref,import_batch_id)
select '2026-02-01',false,28,'legado','legado-status-2026-02',id from sales.import_batches;
select public.ven01_assert(
 (select count(*)=1 from sales.month_statuses where competency='2026-02-01'
   and is_closed=false and last_day_with_data=28),
 'Mes completo com is_closed=false preservado sem reinterpretação'
);
select public.ven01_error($q$
 insert into sales.month_statuses(competency,last_day_with_data) values('2026-02-01',1)
$q$,'23505');
select public.ven01_error($q$
 insert into sales.month_statuses(competency,last_day_with_data) values('2026-03-01',32)
$q$,'23514');
select public.ven01_error($q$
 insert into sales.month_statuses(competency,last_day_with_data) values('2026-02-01',29)
$q$,'23514');
insert into sales.month_statuses(competency,last_day_with_data) values('2024-02-01',29);
select public.ven01_error($q$
 update sales.month_statuses set is_closed=true where competency='2026-02-01'
$q$,'55000');
select public.ven01_error($q$
 update sales.legacy_monthly_adjustments set amount=2 where source_ref='legado-ajuste-1'
$q$,'55000');
select public.ven01_error($q$
 delete from sales.import_batches
$q$,'55000');

-- Lancamento manual: sessao Auth valida, unidade ativa e centavos exatos.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
insert into sales.entries(sale_date,unit_id,payment_method,amount)
 values('2026-10-28','10000000-0000-0000-0000-000000000001','Stone',12.34);
select public.ven01_assert(
 (select count(*)=1 from sales.entries where source='manual'
   and created_by='00000000-0000-0000-0000-000000000002' and version=1),
 'Registro manual tem autor e versao inicial'
);
select public.ven01_error($q$
 insert into sales.entries(sale_date,unit_id,payment_method,amount)
 values('2026-10-28','10000000-0000-0000-0000-000000000001','Stone',11)
$q$,'23505');
select public.ven01_error($q$
 insert into sales.entries(sale_date,unit_id,payment_method,amount)
 values('2026-10-29','10000000-0000-0000-0000-000000000001','Stone',1.001)
$q$,'23514');
select public.ven01_error($q$
 insert into sales.entries(sale_date,unit_id,payment_method,amount)
 values('2026-10-29','10000000-0000-0000-0000-000000000001','PIX',-1)
$q$,'23514');
select public.ven01_error($q$
 insert into sales.entries(sale_date,unit_id,payment_method,amount)
 values('2026-10-29','10000000-0000-0000-0000-000000000001','Pix',1)
$q$,'23514');
select public.ven01_error($q$
 insert into sales.entries(sale_date,unit_id,payment_method,amount)
 values('2026-10-29','10000000-0000-0000-0000-000000000002','Stone',1)
$q$,'42501');

-- Unidade inativa: corrigir lançamento existente da própria unidade continua possivel.
update sales.entries set amount=15.55
 where source_ref='legado-entrada-1';
select public.ven01_assert(
 (select count(*)=1 from sales.entries where source_ref='legado-entrada-1'
   and amount=15.55 and version=2),
 'Correcao historica em unidade inativa'
);
select public.ven01_error($q$
 update sales.entries set unit_id='10000000-0000-0000-0000-000000000002'
 where source='manual' and deleted_at is null
$q$,'23514');

-- Exclusao logica não elimina trilha, libera chave ativa e veda restauracao.
update sales.entries set deleted_at=clock_timestamp(),
 deleted_by='00000000-0000-0000-0000-000000000002'
 where source='manual' and deleted_at is null;
select public.ven01_assert(
 (select count(*)=1 from sales.entries where source='manual'
   and deleted_at is not null and deleted_by='00000000-0000-0000-0000-000000000002'
   and version=2),
 'Exclusao logica e incrementacao de versao'
);
insert into sales.entries(sale_date,unit_id,payment_method,amount)
 values('2026-10-28','10000000-0000-0000-0000-000000000001','Stone',12.34);
select public.ven01_assert(
 (select count(*)=2 from sales.entries where source='manual')
 and (select count(*)=1 from sales.entries where source='manual' and deleted_at is null),
 'Reinsercao apos exclusao: um ativo e historico preservado'
);
select public.ven01_error($q$
 update sales.entries set amount=100
 where source='manual' and deleted_at is not null
$q$,'55000');
select public.ven01_error($q$
 delete from sales.entries where source='manual'
$q$,'55000');
select public.ven01_assert(
 (select count(*)>=4 from core.system_audit_log where module='sales' and
   actor_user_id='00000000-0000-0000-0000-000000000002'
   and action in ('entry.create','entry.edit','entry.delete')),
 'Core recebe autor e evento transacional'
);
select public.ven01_assert(
 (select count(*)=1 from core.system_audit_log where module='sales'
   and action='entry.delete' and before_data->>'deleted_at' is null
   and after_data->>'deleted_at' is not null),
 'Auditoria guarda antes e depois da exclusao'
);

-- Autorizacao negada por padrao, inclusive ao administrador Core existente.
set role authenticated;
select public.ven01_assert(
 not private.has_unit_permission('sales.entry.read','10000000-0000-0000-0000-000000000001'),
 'Permissoes nao se tornam efetivas antes da matriz de papeis'
);
select public.ven01_error('select * from sales.entries','42501');
select public.ven01_error('select * from sales.month_statuses','42501');
select public.ven01_error('insert into sales.entries(sale_date,unit_id,payment_method,amount) values (''2026-10-28'',''10000000-0000-0000-0000-000000000001'',''PIX'',1)','42501');
set role anon;
select set_config('request.jwt.claim.sub','',false);
select public.ven01_error('select * from sales.entries','42501');
reset role;
-- Defesa em profundidade se alguem conceder SELECT por engano.
grant usage on schema sales to authenticated;
grant select on sales.entries to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.ven01_assert((select count(*)=0 from sales.entries),'RLS nega mesmo com grant acidental');
reset role;
revoke select on sales.entries from authenticated;
revoke usage on schema sales from authenticated;
select set_config('request.jwt.claim.sub','',false);
