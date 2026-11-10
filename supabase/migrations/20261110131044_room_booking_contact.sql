begin;

create table room_booking.room_contacts (
  room_id uuid primary key references room_booking.rooms(id),
  responsible_name text not null check (
    responsible_name = btrim(responsible_name)
    and char_length(responsible_name) between 1 and 120
    and responsible_name ~ '[[:alpha:]]'
    and responsible_name ~ '^[[:alpha:] .''’-]+$'
  ),
  extension text not null check (extension ~ '^[0-9]{1,8}$'),
  version integer not null default 1 check (version > 0)
);

alter table room_booking.room_contacts enable row level security;
revoke all on room_booking.room_contacts from public, anon, authenticated;
create policy room_contacts_client_deny on room_booking.room_contacts
  as restrictive for all to anon, authenticated using (false) with check (false);

create function public.room_booking_contact() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform room_booking.authorize('room_booking.schedule.read');
  select jsonb_build_object(
    'room_id', r.id, 'responsible_name', c.responsible_name,
    'extension', c.extension, 'version', coalesce(c.version, 0)
  ) into result
  from room_booking.rooms r
  left join room_booking.room_contacts c on c.room_id = r.id
  where r.active order by r.id limit 1;
  return result;
end $$;

create function public.room_booking_save_contact(
  p_room_id uuid, p_responsible_name text, p_extension text, p_version integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room uuid;
  v_name text := normalize(btrim(p_responsible_name));
  v_extension text := btrim(p_extension);
  previous room_booking.room_contacts;
  saved room_booking.room_contacts;
begin
  -- O mesmo lock das demais gravações da sala protege inclusive o primeiro cadastro.
  v_room := room_booking.lock_room();
  perform room_booking.authorize('room_booking.manage');
  select * into previous from room_booking.room_contacts where room_id = v_room;
  if v_room is distinct from p_room_id
    or coalesce(previous.version, 0) is distinct from p_version then
    raise exception 'Version conflict' using errcode = '40001';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 120
    or v_name !~ '[[:alpha:]]' or v_name !~ '^[[:alpha:] .''’-]+$' then
    raise exception 'Informe um nome válido, com até 120 caracteres.' using errcode = '23514';
  end if;
  if v_extension is null or v_extension !~ '^[0-9]{1,8}$' then
    raise exception 'Informe um ramal com 1 a 8 dígitos.' using errcode = '23514';
  end if;

  insert into room_booking.room_contacts (room_id, responsible_name, extension)
  values (v_room, v_name, v_extension)
  on conflict (room_id) do update set
    responsible_name = excluded.responsible_name, extension = excluded.extension,
    version = previous.version + 1
  returning * into saved;

  insert into core.system_audit_log (
    actor_user_id, module, action, entity_type, entity_id, before_data, after_data
  ) values (
    auth.uid(), 'room_booking', 'contact_save', 'room_contacts', v_room::text,
    case when previous.version is not null then jsonb_build_object('version', previous.version) end,
    jsonb_build_object(
      'version', saved.version,
      'name_changed', saved.responsible_name is distinct from previous.responsible_name,
      'extension_changed', saved.extension is distinct from previous.extension
    )
  );
  return to_jsonb(saved);
end $$;

revoke all on function public.room_booking_contact(),
  public.room_booking_save_contact(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.room_booking_contact(),
  public.room_booking_save_contact(uuid, text, text, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
