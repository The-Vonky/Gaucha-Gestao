-- Correção autorizada da VEN-04B: composição institucional explícita no Core.
-- Sem atribuições a funcionários, bypass, alteração de RLS ou mudança na D5-B.
begin;

do $$
begin
 if not exists(select 1 from core.roles where key='platform_administrator' and system and active and global_only) then
  raise exception 'Platform Administrator protegido e ativo ausente';
 end if;
 if (select count(*) from core.permissions where active and key in (
  'sales.entry.read','sales.entry.create','sales.entry.edit','sales.entry.delete',
  'sales.dashboard.read','sales.export.filtered','sales.export.full')) <> 7 then
  raise exception 'Catálogo Vendas incompleto ou inativo';
 end if;
 if exists(select 1 from core.role_permissions rp join core.roles r on r.id=rp.role_id
  where r.key='platform_administrator' and rp.permission_key='room_booking.manage') then
  raise exception 'Conflito com D5-B: diagnosticar composição administrativa';
 end if;
end $$;

insert into core.roles(key,name,description,system,global_only) values
 ('sales_manager','Sales Manager','Gestão de Vendas / Maquininhas: consulta, cadastro, edição, exclusão, dashboard e capacidades de exportação no escopo atribuído.',true,false),
 ('sales_operator','Sales Operator','Operação de Vendas / Maquininhas: consulta e cadastro de lançamentos no escopo atribuído.',true,false)
on conflict(key) do nothing;

-- Colisão de chave nunca promove um papel personalizado a institucional nem amplia
-- silenciosamente uma composição previamente divergente.
do $$
begin
 if (select count(*) from core.roles where key in ('sales_manager','sales_operator')
  and system and active and not global_only) <> 2 then
  raise exception 'Colisão nas chaves institucionais de Vendas';
 end if;
 if exists(select 1 from core.role_permissions rp join core.roles r on r.id=rp.role_id
  where (r.key='sales_manager' and rp.permission_key not in (
    'sales.entry.read','sales.entry.create','sales.entry.edit','sales.entry.delete',
    'sales.dashboard.read','sales.export.filtered','sales.export.full'))
   or (r.key='sales_operator' and rp.permission_key not in ('sales.entry.read','sales.entry.create'))) then
  raise exception 'Composição institucional de Vendas divergente';
 end if;
end $$;

insert into core.role_permissions(role_id,permission_key)
select r.id,p.permission_key from core.roles r cross join (values
 ('sales.entry.read'),('sales.entry.create'),('sales.entry.edit'),('sales.entry.delete'),
 ('sales.dashboard.read'),('sales.export.filtered'),('sales.export.full')
) p(permission_key)
where r.system and (r.key in ('platform_administrator','sales_manager')
 or (r.key='sales_operator' and p.permission_key in ('sales.entry.read','sales.entry.create')))
on conflict(role_id,permission_key) do nothing;

commit;
