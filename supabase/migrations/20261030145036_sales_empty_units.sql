begin;
-- MEL-01: permissões globais existentes continuam válidas com catálogo vazio.
-- Mantém locks de revogação, RLS, grants e validação de unidade nas mutações.
-- Nenhuma exclusão de dados ou nova concessão pertence a esta migration.

create or replace function sales_private.authorize(p_permission text) returns void
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
 if not private.is_active_user() or not (private.has_global_permission(p_permission) or exists(
   select 1 from core.units u where private.has_unit_permission(p_permission,u.id)
 )) then
   raise exception 'Acesso negado.' using errcode='42501';
 end if;
end $$;

create or replace function public.sales_operation_units(p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.is_active_user() or not (
   private.has_global_permission('sales.entry.read')
   or private.has_global_permission('sales.entry.create')
   or private.has_global_permission('sales.entry.edit')
   or private.has_global_permission('sales.entry.delete')
   or exists(
   select 1 from core.units u where
     private.has_unit_permission('sales.entry.read',u.id)
     or private.has_unit_permission('sales.entry.create',u.id)
     or private.has_unit_permission('sales.entry.edit',u.id)
     or private.has_unit_permission('sales.entry.delete',u.id)
 )) then
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

commit;
