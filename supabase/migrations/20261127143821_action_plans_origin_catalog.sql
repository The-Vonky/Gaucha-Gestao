begin;

-- O leitor por vínculo consulta apenas versões usadas nas inspeções visíveis pela RLS.
alter policy catalog_read on audit.checklist_templates using (
 exists(select from core.my_access() a where a.permission like 'audit.%')
 or exists(select from audit.inspections i where i.template_version=checklist_templates.version)
);
alter policy catalog_read on audit.checklist_sections using (
 exists(select from core.my_access() a where a.permission like 'audit.%')
 or exists(select from audit.inspections i where i.template_version=checklist_sections.template_version)
);
alter policy catalog_read on audit.checklist_items using (
 exists(select from core.my_access() a where a.permission like 'audit.%')
 or exists(select from audit.inspections i where i.template_version=checklist_items.template_version)
);

commit;
