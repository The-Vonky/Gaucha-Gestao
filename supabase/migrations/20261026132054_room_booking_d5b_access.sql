begin;
-- D5-A revogada pelo responsável em 26/10/2026; D5-B vigente.
-- Nenhum papel/usuário/atribuição é removido. AG-01/02 permanecem imutáveis.
delete from core.role_permissions
where role_id=(select id from core.roles where key='platform_administrator')
  and permission_key='room_booking.manage';
update core.roles set name='Room Booking Manager', description='Gestão de pedidos e reservas.'
where key='room_booking_manager';
update core.roles set name='Room Booking Requester', description='Solicitações individuais e consulta da agenda.'
where key='room_booking_requester';

create function private.permission_assignment_allowed(p_permission text) returns boolean
language sql stable security definer set search_path='' as $$
 -- D5-B: separação explícita de funções aprovada em 26/10/2026.
 -- Exceção restrita a esta capacidade; demais permissões mantêm o contrato Core.
 select p_permission <> 'room_booking.manage' or (
   exists(select 1 from core.user_role_assignments a join core.roles r on r.id=a.role_id
     where a.user_id=auth.uid() and a.active and a.scope_type='global'
       and r.active and r.key='room_booking_manager')
   and not exists(select 1 from core.user_role_assignments a join core.roles r on r.id=a.role_id
     where a.user_id=auth.uid() and a.active and r.active and r.key='platform_administrator')
 )
$$;
revoke all on function private.permission_assignment_allowed(text) from public,anon,authenticated;

create or replace function private.has_scoped_permission(p_permission text,p_unit uuid default null,p_sector uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and private.permission_assignment_allowed(p_permission) and exists(
 select 1 from core.user_role_assignments a
 join core.roles r on r.id=a.role_id and r.active
 join core.role_permissions rp on rp.role_id=r.id
 join core.permissions p on p.key=rp.permission_key and p.active
 where a.user_id=auth.uid() and a.active and p.key=p_permission and
 (a.scope_type='global' or (a.unit_id=p_unit and (a.scope_type='unit' or (a.scope_type='sector' and a.sector_id=p_sector)))))
$$;

create or replace function core.my_access() returns table(permission text,scope_type text,unit_id uuid,sector_id uuid)
language sql stable security definer set search_path='' as $$
 select distinct p.key,a.scope_type,a.unit_id,a.sector_id from core.user_role_assignments a
 join core.roles r on r.id=a.role_id and r.active
 join core.role_permissions rp on rp.role_id=r.id join core.permissions p on p.key=rp.permission_key and p.active
 where a.user_id=auth.uid() and a.active and private.is_active_user() and private.permission_assignment_allowed(p.key)
$$;

create or replace function private.validate_assignment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Serialize role composition changes with new assignments.
 perform 1 from core.roles where id=new.role_id for share;
 if new.active then
 -- A fresh statement snapshot after the role lock prevents stale delegation
 -- if save_role committed a permission change while this grant was waiting.
 if auth.uid() is not null and not private.can_delegate(new.role_id,new.unit_id,new.sector_id) then raise exception 'Cannot delegate permission' using errcode='42501'; end if;
 -- Serializa novas atribuições com autorização de operações em andamento.
 perform 1 from core.profiles where id=new.user_id for update;
 if new.unit_id is not null then perform 1 from core.units where id=new.unit_id for share; end if;
 if new.sector_id is not null then perform 1 from core.sectors where id=new.sector_id for share; end if;
 if not exists(select 1 from core.profiles where id=new.user_id and active) then raise exception 'Inactive profile' using errcode='23514'; end if;
 if not exists(select 1 from core.roles where id=new.role_id and active and (not global_only or new.scope_type='global')) then raise exception 'Invalid role or scope' using errcode='23514'; end if;
 if new.unit_id is not null and not exists(select 1 from core.units where id=new.unit_id and active) then raise exception 'Inactive unit' using errcode='23514'; end if;
 if new.sector_id is not null and not exists(select 1 from core.sectors where id=new.sector_id and active) then raise exception 'Inactive sector' using errcode='23514'; end if;
 end if;
 return new;
end $$;

notify pgrst,'reload schema';
commit;
