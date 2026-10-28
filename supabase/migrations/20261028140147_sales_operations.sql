begin;
-- VEN-02: somente operações; não aplicar em notebook/STAGING/PROD nesta tarefa.
-- Os clientes continuam sem USAGE nos schemas privados e sem DML nas tabelas.

create function sales_private.authorize(p_permission text) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Bloqueios compartilhados até o commit: revogação e operação têm ordem real.
 -- Não usar STABLE: cada comando após uma espera precisa de snapshot atualizado.
 perform 1 from core.profiles where id=auth.uid() and active for share;
 perform 1 from core.user_role_assignments
 where user_id=auth.uid() and active and scope_type in ('global','unit') order by id for share;
 perform 1 from core.roles where id in (
   select role_id from core.user_role_assignments
   where user_id=auth.uid() and active and scope_type in ('global','unit')
 ) order by id for share;
 perform 1 from core.role_permissions where permission_key=p_permission and role_id in (
   select role_id from core.user_role_assignments
   where user_id=auth.uid() and active and scope_type in ('global','unit')
 ) order by role_id for share;
 perform 1 from core.permissions where key=p_permission for share;
 if not private.is_active_user() or not exists(
   select 1 from core.units u where private.has_unit_permission(p_permission,u.id)
 ) then
   raise exception 'Acesso negado.' using errcode='42501';
 end if;
end $$;

create function sales_private.validate_entry(p_date date,p_method text,p_amount text) returns numeric
language plpgsql set search_path='' as $$
declare v_amount numeric;
begin
 if p_date is null or not isfinite(p_date)
   or p_date not between date '0001-01-01' and date '9999-12-31'
   or p_method is null or p_method not in ('Stone','PIX') then
   raise exception 'Informe data civil válida e forma Stone ou PIX.' using errcode='23514';
 end if;
 -- Sem sinal, espaços, expoentes, vírgula, NaN ou arredondamento implícito.
 if p_amount is null or length(p_amount)>15
   or p_amount !~ '^(0|[1-9][0-9]{0,11})([.][0-9]{1,2})?$' then
   raise exception 'Informe valor decimal positivo com até duas casas.' using errcode='23514';
 end if;
 v_amount:=p_amount::numeric;
 if v_amount<=0 or v_amount>=1000000000000 then
   raise exception 'Valor fora do intervalo permitido.' using errcode='23514';
 end if;
 return v_amount;
end $$;

create function sales_private.entry_json(e sales.entries) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',e.id,'sale_date',e.sale_date,'unit_id',e.unit_id,
   'payment_method',e.payment_method,'amount',e.amount::numeric(14,2)::text,
   'created_by',e.created_by,'updated_by',e.updated_by,'created_at',e.created_at,
   'updated_at',e.updated_at,'version',e.version,'deleted_at',e.deleted_at,'deleted_by',e.deleted_by)
$$;

create function public.sales_entries_list(
 p_from date default null,p_to date default null,p_unit uuid default null,
 p_method text default null,p_limit integer default 50,p_offset integer default 0
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform sales_private.authorize('sales.entry.read');
 if p_unit is not null and not private.has_unit_permission('sales.entry.read',p_unit) then
   raise exception 'Acesso negado.' using errcode='42501';
 end if;
 if (p_from is not null and not isfinite(p_from)) or (p_to is not null and not isfinite(p_to))
   or p_from>p_to or (p_method is not null and p_method not in ('Stone','PIX'))
   or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then
   raise exception 'Filtros ou paginação inválidos.' using errcode='23514';
 end if;
 select coalesce(jsonb_agg(sales_private.entry_json(q) order by q.sale_date desc,q.id desc),'[]'::jsonb)
 into result from (
   select e.* from sales.entries e where e.deleted_at is null
   and private.has_unit_permission('sales.entry.read',e.unit_id)
   and (p_from is null or e.sale_date>=p_from) and (p_to is null or e.sale_date<=p_to)
   and (p_unit is null or e.unit_id=p_unit) and (p_method is null or e.payment_method=p_method)
   order by e.sale_date desc,e.id desc limit p_limit offset p_offset
 ) q;
 return result;
end $$;

create function public.sales_entry_detail(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e sales.entries;
begin
 perform sales_private.authorize('sales.entry.read');
 select * into e from sales.entries where id=p_id and deleted_at is null
   and private.has_unit_permission('sales.entry.read',unit_id);
 if not found then
   raise exception 'Lançamento indisponível.' using errcode='P0002';
 end if;
 return sales_private.entry_json(e);
end $$;

create function public.sales_entry_create(p_date date,p_unit uuid,p_method text,p_amount text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e sales.entries; v_amount numeric; v_active boolean;
begin
 perform sales_private.authorize('sales.entry.create');
 if p_unit is null or not private.has_unit_permission('sales.entry.create',p_unit) then
   raise exception 'Acesso negado.' using errcode='42501';
 end if;
 -- FOR SHARE, não KEY SHARE: mudar active não altera a chave da unidade.
 select active into v_active from core.units where id=p_unit for share;
 if not found or not v_active then
   raise exception 'Novos lançamentos exigem unidade ativa.' using errcode='23514';
 end if;
 v_amount:=sales_private.validate_entry(p_date,p_method,p_amount);
 insert into sales.entries(sale_date,unit_id,payment_method,amount,created_by)
 values(p_date,p_unit,p_method,v_amount,auth.uid()) returning * into e;
 return sales_private.entry_json(e);
exception when unique_violation then
 raise exception 'Já existe lançamento ativo para data, unidade e forma.' using errcode='23505';
end $$;

create function public.sales_entry_update(
 p_id uuid,p_expected_version integer,p_date date,p_unit uuid,p_method text,p_amount text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e sales.entries; v_amount numeric; v_active boolean;
begin
 perform sales_private.authorize('sales.entry.edit');
 -- Escopo na própria busca: UUID externo, inexistente e excluído têm o mesmo erro.
 select * into e from sales.entries where id=p_id and deleted_at is null
   and private.has_unit_permission('sales.entry.edit',unit_id) for update;
 if not found then
   raise exception 'Lançamento indisponível.' using errcode='P0002';
 end if;
 if p_unit is null or not private.has_unit_permission('sales.entry.edit',p_unit) then
   raise exception 'Acesso negado.' using errcode='42501';
 end if;
 if p_expected_version is null or p_expected_version<1 then
   raise exception 'Informe a versão esperada.' using errcode='23514';
 end if;
 if e.version<>p_expected_version then
   raise exception 'Lançamento alterado. Atualize antes de tentar novamente.' using errcode='40001';
 end if;
 -- Ordem determinística para transferências opostas. Mantém a origem histórica.
 perform 1 from core.units where id in (e.unit_id,p_unit) order by id for share;
 select active into v_active from core.units where id=p_unit;
 if not found or (p_unit<>e.unit_id and not v_active) then
   raise exception 'Transferência exige unidade de destino ativa.' using errcode='23514';
 end if;
 v_amount:=sales_private.validate_entry(p_date,p_method,p_amount);
 update sales.entries set sale_date=p_date,unit_id=p_unit,payment_method=p_method,amount=v_amount
 where id=e.id returning * into e;
 return sales_private.entry_json(e);
exception when unique_violation then
 raise exception 'Já existe lançamento ativo para data, unidade e forma.' using errcode='23505';
end $$;

create function public.sales_entry_delete(p_id uuid,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e sales.entries;
begin
 perform sales_private.authorize('sales.entry.delete');
 select * into e from sales.entries where id=p_id and deleted_at is null
   and private.has_unit_permission('sales.entry.delete',unit_id) for update;
 if not found then
   raise exception 'Lançamento indisponível.' using errcode='P0002';
 end if;
 if p_expected_version is null or p_expected_version<1 then
   raise exception 'Informe a versão esperada.' using errcode='23514';
 end if;
 if e.version<>p_expected_version then
   raise exception 'Lançamento alterado. Atualize antes de tentar novamente.' using errcode='40001';
 end if;
 update sales.entries set deleted_at=clock_timestamp(),deleted_by=auth.uid()
 where id=e.id returning * into e;
 return sales_private.entry_json(e);
end $$;

revoke all on function sales_private.authorize(text),sales_private.validate_entry(date,text,text),
 sales_private.entry_json(sales.entries) from public,anon,authenticated;
revoke all on function public.sales_entries_list(date,date,uuid,text,integer,integer),
 public.sales_entry_detail(uuid),public.sales_entry_create(date,uuid,text,text),
 public.sales_entry_update(uuid,integer,date,uuid,text,text),public.sales_entry_delete(uuid,integer)
 from public,anon,authenticated;
grant execute on function public.sales_entries_list(date,date,uuid,text,integer,integer),
 public.sales_entry_detail(uuid),public.sales_entry_create(date,uuid,text,text),
 public.sales_entry_update(uuid,integer,date,uuid,text,text),public.sales_entry_delete(uuid,integer)
 to authenticated;
notify pgrst,'reload schema';
commit;
