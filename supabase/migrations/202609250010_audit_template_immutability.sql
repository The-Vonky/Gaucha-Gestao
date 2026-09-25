begin;
-- 0004 blocked UPDATE/DELETE of catalog rows but not INSERT, so a template version already used
-- by inspections could still gain sections/items. New content requires a new template version.
create function audit_private.forbid_used_template_insert() returns trigger language plpgsql set search_path='' as $$
begin
 -- Mutex with create_inspection, which holds the template row FOR SHARE: a first use in progress
 -- makes this insert wait, and a pending insert makes the first use wait. The FK checks only take
 -- FOR KEY SHARE (compatible), so they do not serialize this. Decide after the lock, on a fresh snapshot.
 perform 1 from audit.checklist_templates where version=new.template_version for no key update;
 if exists(select 1 from audit.inspections where template_version=new.template_version) then
  raise exception 'Checklist template is in use; create a new template version' using errcode='55000';
 end if;
 return new;
end $$;
create trigger immutable_used_template before insert on audit.checklist_sections for each row execute function audit_private.forbid_used_template_insert();
create trigger immutable_used_template before insert on audit.checklist_items for each row execute function audit_private.forbid_used_template_insert();

revoke all on function audit_private.forbid_used_template_insert() from public,anon,authenticated;
commit;
