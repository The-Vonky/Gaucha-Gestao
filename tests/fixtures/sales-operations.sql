-- Dados exclusivamente sintéticos de PGlite/CI descartável. Nunca aplicar em base existente.
insert into auth.users(id,email,email_confirmed_at)
select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'ven02-'||n||'@example.test',now() from generate_series(1,10) n;
select private.bootstrap_administrator('00000000-0000-0000-0000-000000000001');
insert into core.units(id,code,name) values
 ('10000000-0000-0000-0000-000000000001','VEN02-A','Unidade sintética A'),
 ('10000000-0000-0000-0000-000000000002','VEN02-B','Unidade sintética B'),
 ('10000000-0000-0000-0000-000000000003','VEN02-C','Unidade sintética histórica');
insert into core.sectors(id,code,name) values
 ('20000000-0000-0000-0000-000000000001','VEN02-S','Setor sintético');
insert into core.unit_sectors(unit_id,sector_id) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
insert into core.roles(id,key,name) values
 ('30000000-0000-0000-0000-000000000001','ven02_operator','Operação sintética'),
 ('30000000-0000-0000-0000-000000000002','ven02_reader','Leitura sintética'),
 ('30000000-0000-0000-0000-000000000003','ven02_editor','Correção sintética'),
 ('30000000-0000-0000-0000-000000000004','ven02_deleter','Exclusão sintética'),
 ('30000000-0000-0000-0000-000000000005','ven02_creator','Criação sintética');
insert into core.role_permissions(role_id,permission_key)
select '30000000-0000-0000-0000-000000000001',key from core.permissions
where key in ('sales.entry.read','sales.entry.create','sales.entry.edit','sales.entry.delete');
insert into core.role_permissions(role_id,permission_key) values
 ('30000000-0000-0000-0000-000000000002','sales.entry.read'),
 ('30000000-0000-0000-0000-000000000003','sales.entry.edit'),
 ('30000000-0000-0000-0000-000000000004','sales.entry.delete'),
 ('30000000-0000-0000-0000-000000000005','sales.entry.create');
-- 2 global; 3 e 4 colegas de A; 5 leitura A; 6 setor A; 7 sem papel; 8 inativo;
-- 9 apenas B; 10 cada capacidade em unidade diferente, sem misturar escopos.
insert into core.user_role_assignments(user_id,role_id,scope_type)
values('00000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','global');
insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '30000000-0000-0000-0000-000000000001','unit','10000000-0000-0000-0000-000000000001'
from unnest(array[3,4,8]) n;
insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) values
 ('00000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000002','unit','10000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000009','30000000-0000-0000-0000-000000000001','unit','10000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000002','unit','10000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000003','unit','10000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000004','unit','10000000-0000-0000-0000-000000000003'),
 ('00000000-0000-0000-0000-000000000010','30000000-0000-0000-0000-000000000005','unit','10000000-0000-0000-0000-000000000003');
insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) values
 ('00000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000001','sector',
 '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
update core.profiles set active=false where id='00000000-0000-0000-0000-000000000008';
