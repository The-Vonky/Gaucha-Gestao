begin;
-- VEN-04A: somente referências Core pertinentes às capacidades operacionais.
-- SECURITY DEFINER necessário: operador não recebe SELECT no catálogo Core.
create function public.sales_operation_units(p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_active_user() or not exists(
   select 1 from core.units u where
     private.has_unit_permission('sales.entry.read',u.id)
     or private.has_unit_permission('sales.entry.create',u.id)
     or private.has_unit_permission('sales.entry.edit',u.id)
     or private.has_unit_permission('sales.entry.delete',u.id)
 ) then
   raise exception 'Acesso negado.' using errcode='42501';
 end if;
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then
   raise exception 'Paginação inválida.' using errcode='23514';
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.code,q.id),'[]'::jsonb) into result from (
   select u.id,u.code,u.name,u.active,
     private.has_unit_permission('sales.entry.read',u.id) can_read,
     private.has_unit_permission('sales.entry.create',u.id) can_create,
     private.has_unit_permission('sales.entry.edit',u.id) can_edit,
     private.has_unit_permission('sales.entry.delete',u.id) can_delete
   from core.units u where
     private.has_unit_permission('sales.entry.read',u.id)
     or private.has_unit_permission('sales.entry.create',u.id)
     or private.has_unit_permission('sales.entry.edit',u.id)
     or private.has_unit_permission('sales.entry.delete',u.id)
   order by u.code,u.id limit p_limit offset p_offset
 ) q;
 return result;
end $$;
revoke all on function public.sales_operation_units(integer,integer) from public,anon,authenticated;
grant execute on function public.sales_operation_units(integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
