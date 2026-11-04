begin;
-- VEN-05A: leitura exclusivamente autorizada. Sem concessão a papéis/usuários.
-- Não aplicar em bancos persistentes nesta tarefa.
create function public.sales_export_page(
 p_mode text, p_from date default null, p_to date default null,
 p_units uuid[] default null, p_method text default null,
 p_offset integer default 0, p_limit integer default 500, p_token text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_permission text; v_payload jsonb; v_token text; v_rows jsonb; v_count integer;
begin
 if p_mode is null or p_mode not in ('filtered','full') then
   raise exception 'Modalidade inválida.' using errcode='23514';
 end if;
 v_permission:=case p_mode when 'full' then 'sales.export.full' else 'sales.export.filtered' end;
 -- Ordem fixa de autorização; helpers mantêm bloqueios Core até o commit.
 perform sales_private.authorize('sales.entry.read');
 perform sales_private.authorize(v_permission);
 -- Dashboard é opcional por unidade; bloquear suas relações antes de decidir
 -- a visibilidade dos ajustes, sem exigir essa capacidade para lançamentos.
 perform 1 from core.role_permissions where permission_key='sales.dashboard.read'
   and role_id in (select role_id from core.user_role_assignments
     where user_id=auth.uid() and active and scope_type in ('global','unit'))
   order by role_id for share;
 perform 1 from core.permissions where key='sales.dashboard.read' for share;
 if p_offset is null or p_offset not between 0 and 20000 or p_limit is null
   or p_limit not between 1 and 500
   or (p_offset>0 and p_token is null)
   or (p_token is not null and p_token !~ '^[0-9a-f]{64}$')
   or (p_from is not null and (not isfinite(p_from) or p_from not between date '0001-01-01' and date '9999-12-31'))
   or (p_to is not null and (not isfinite(p_to) or p_to not between date '0001-01-01' and date '9999-12-31'))
   or p_from>p_to or (p_method is not null and p_method not in ('Stone','PIX'))
   or (p_units is not null and (coalesce(array_ndims(p_units),0)<>1
     or cardinality(p_units) not between 1 and 1000 or array_position(p_units,null) is not null))
   or (p_mode='full' and (p_from is not null or p_to is not null or p_units is not null or p_method is not null)) then
   raise exception 'Filtros ou paginação inválidos.' using errcode='23514';
 end if;
 if p_units is not null and exists(select 1 from unnest(p_units) u
   where not private.has_unit_permission('sales.entry.read',u)
     or not private.has_unit_permission(v_permission,u)) then
   raise exception 'Acesso negado.' using errcode='42501';
 end if;
 if not ((private.has_global_permission('sales.entry.read') and private.has_global_permission(v_permission))
   or exists(select 1 from core.units u
   where private.has_unit_permission('sales.entry.read',u.id)
     and private.has_unit_permission(v_permission,u.id))) then
   raise exception 'Acesso negado.' using errcode='42501';
 end if;

 -- Uma única instrução: catálogo, linhas, totais e impressão digital compartilham
 -- o mesmo snapshot MVCC. Materialização limitada a 20.001 linhas (sentinela).
 with units as materialized (
   select u.id,u.code,u.name,u.active,
     private.has_unit_permission('sales.dashboard.read',u.id) adjustments_authorized
   from core.units u where private.has_unit_permission('sales.entry.read',u.id)
     and private.has_unit_permission(v_permission,u.id)
     and (p_units is null or u.id=any(p_units)) order by u.id limit 1001
 ), entries as materialized (
   select e.id,e.sale_date as date,e.unit_id,e.payment_method,e.amount,e.updated_at,e.version
   from sales.entries e join units u on u.id=e.unit_id
   where e.deleted_at is null and (p_from is null or e.sale_date>=p_from)
     and (p_to is null or e.sale_date<=p_to)
     and (p_method is null or e.payment_method=p_method)
   order by e.sale_date,e.id limit 20001
 ), adjustments as materialized (
   select a.id,a.competency as date,a.unit_id,a.payment_method,a.amount,a.reason
   from sales.legacy_monthly_adjustments a join units u on u.id=a.unit_id and u.adjustments_authorized
   where (p_from is null or a.competency>=p_from)
     and (p_to is null or (a.competency+interval '1 month - 1 day')::date<=p_to)
     and (p_method is null or a.payment_method=p_method)
   order by a.competency,a.id limit 20001
 ), records as materialized (
   select * from (
     select 0 kind,e.date,e.id,e.amount,jsonb_build_object(
       'kind','entry','id',e.id,'date',e.date,'unit_id',e.unit_id,
       'payment_method',e.payment_method,'amount',e.amount::numeric(14,2)::text,
       'updated_at',e.updated_at,'version',e.version) data from entries e
     union all
     select 1,a.date,a.id,a.amount,jsonb_build_object(
       'kind','adjustment','id',a.id,'date',a.date,'unit_id',a.unit_id,
       'payment_method',a.payment_method,'amount',a.amount::numeric(14,2)::text,
       'reason',a.reason) from adjustments a
   ) q order by kind,date,id limit 20001
 )
 select jsonb_build_object(
   'contract_version',1,'mode',p_mode,
   'filters',jsonb_build_object('from',p_from,'to',p_to,'method',p_method),
   'units',coalesce((select jsonb_agg(to_jsonb(u) order by id) from units u),'[]'::jsonb),
   'rows',coalesce(jsonb_agg(data order by kind,date,id),'[]'::jsonb),
   'entry_count',count(*) filter(where kind=0),'adjustment_count',count(*) filter(where kind=1),
   'entry_total',coalesce(sum(amount) filter(where kind=0),0)::numeric(30,2)::text,
   'adjustment_total',coalesce(sum(amount) filter(where kind=1),0)::numeric(30,2)::text,
   'total',coalesce(sum(amount),0)::numeric(30,2)::text,
   'entry_from',min(date) filter(where kind=0),'entry_to',max(date) filter(where kind=0),
   'adjustment_from',min(date) filter(where kind=1),'adjustment_to',max(date) filter(where kind=1)
 ) into v_payload from records;
 v_count:=jsonb_array_length(v_payload->'rows');
 if v_count>20000 or jsonb_array_length(v_payload->'units')>1000
   or octet_length(v_payload::text)>8388608 then
   raise exception 'Limite de volume da exportação atingido.' using errcode='54000';
 end if;
 -- Token de detecção de mudanças, nunca credencial ou substituto da autorização.
 v_token:=encode(sha256(convert_to(v_payload::text,'UTF8')),'hex');
 if p_token is not null and p_token<>v_token then
   raise exception 'Dados ou escopo mudaram. Reinicie a exportação.' using errcode='40001';
 end if;
 if p_offset>v_count then
   raise exception 'Paginação inválida.' using errcode='23514';
 end if;
 select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into v_rows
 from jsonb_array_elements(v_payload->'rows') with ordinality
 where ordinality>p_offset and ordinality<=p_offset+p_limit;
 return (v_payload-'rows')||jsonb_build_object('rows',v_rows,'token',v_token,
   'record_count',v_count,'offset',p_offset,'next_offset',least(p_offset+p_limit,v_count),
   'checked_at',clock_timestamp());
end $$;
revoke all on function public.sales_export_page(text,date,date,uuid[],text,integer,integer,text)
 from public,anon,authenticated;
grant execute on function public.sales_export_page(text,date,date,uuid[],text,integer,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;
