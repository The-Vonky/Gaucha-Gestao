begin;
insert into core.permissions(key,domain,resource,action,description) values
('audit.inspection.read','audit','inspection','read','Consultar auditorias'),
('audit.inspection.create','audit','inspection','create','Criar auditorias'),
('audit.inspection.edit','audit','inspection','edit','Editar auditorias'),
('audit.inspection.finalize','audit','inspection','finalize','Finalizar auditorias'),
('audit.inspection.reopen','audit','inspection','reopen','Reabrir auditorias'),
('audit.inspection.export','audit','inspection','export','Exportar auditorias'),
('action_plan.read','action_plan','plan','read','Consultar planos de ação'),
('action_plan.create_manual','action_plan','plan','create_manual','Criar planos manuais'),
('action_plan.write','action_plan','plan','write','Editar planos de ação'),
('action_plan.verify','action_plan','plan','verify','Verificar planos de ação'),
('admin.user.read','admin','user','read','Consultar usuários'),
('admin.user.manage','admin','user','manage','Gerenciar usuários e atribuições'),
('admin.role.read','admin','role','read','Consultar perfis de acesso e permissões'),
('admin.role.manage','admin','role','manage','Gerenciar perfis de acesso'),
('admin.unit.read','admin','unit','read','Consultar unidades'),
('admin.unit.manage','admin','unit','manage','Gerenciar unidades'),
('admin.sector.read','admin','sector','read','Consultar setores'),
('admin.sector.manage','admin','sector','manage','Gerenciar setores'),
('admin.audit_log.read','admin','audit_log','read','Consultar logs do sistema');
insert into core.roles(key,name,description,system,global_only) values
('platform_administrator','Platform Administrator','Administração global da plataforma',true,true),
('quality','Quality','Operação de Qualidade e Planos de Ação',true,false),
('quality_viewer','Quality Viewer','Consulta e exportação de Qualidade',true,false);
insert into core.role_permissions select r.id,p.key from core.roles r cross join core.permissions p where r.key='platform_administrator';
insert into core.role_permissions select r.id,p.key from core.roles r cross join core.permissions p where r.key='quality' and p.domain in ('audit','action_plan');
insert into core.role_permissions select r.id,p.key from core.roles r cross join core.permissions p where r.key='quality_viewer' and p.key in ('audit.inspection.read','audit.inspection.export','action_plan.read');

-- Operator-only, one-time bootstrap; never exposed via Data API or granted to clients.
create function private.bootstrap_administrator(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare r uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(24092026);
 select id into strict r from core.roles where key='platform_administrator';
 if exists(select 1 from core.user_role_assignments where role_id=r) then raise exception 'Administrator bootstrap already completed'; end if;
 if not exists(select 1 from auth.users u join core.profiles p on p.id=u.id where u.id=p_user and u.email_confirmed_at is not null and p.active) then raise exception 'A confirmed active Auth identity is required'; end if;
 insert into core.user_role_assignments(user_id,role_id,scope_type) values(p_user,r,'global');
end $$;
revoke all on function private.bootstrap_administrator(uuid) from public,anon,authenticated;
commit;
