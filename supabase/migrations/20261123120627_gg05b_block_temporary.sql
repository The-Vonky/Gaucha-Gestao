begin;

alter table private.identity_credentials drop constraint identity_credentials_state_check;
alter table private.identity_credentials add constraint identity_credentials_state_check
  check (state in ('active', 'temporary', 'quarantined', 'needs_reset'));

create or replace function private.identity_invalidate_deactivated() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.active and not new.active and private.identity_enabled() then
    perform private.identity_lock(new.id, false);
    update private.identity_credentials
      set generation = generation + 1,
          state = case when state = 'temporary' then 'needs_reset' else state end
      where user_id = new.id;
    delete from private.identity_admissions where user_id = new.id;
  end if;
  return new;
end
$$;

commit;
