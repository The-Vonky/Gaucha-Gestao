begin;
-- 0004 blocked UPDATE/DELETE of catalog rows but not INSERT, so a template version already used
-- by inspections could still gain sections/items. New content requires a new template version.
create function audit_private.forbid_used_template_insert() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from audit.inspections where template_version=new.template_version) then
  raise exception 'Checklist template is in use; create a new template version' using errcode='55000';
 end if;
 return new;
end $$;
create trigger immutable_used_template before insert on audit.checklist_sections for each row execute function audit_private.forbid_used_template_insert();
create trigger immutable_used_template before insert on audit.checklist_items for each row execute function audit_private.forbid_used_template_insert();

revoke all on function audit_private.forbid_used_template_insert() from public,anon,authenticated;
commit;
