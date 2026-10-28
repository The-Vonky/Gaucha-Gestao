-- Exclusivamente PGlite/CI vazio. A execução local usa transação com ROLLBACK.
-- Fixture VEN-02 fornece identidades/escopos sintéticos. Nenhum grant produtivo.
insert into core.role_permissions(role_id,permission_key) values
 ('30000000-0000-0000-0000-000000000001','sales.dashboard.read');
insert into core.roles(id,key,name) values
 ('30000000-0000-0000-0000-000000000006','ven03_dashboard','Dashboard sintético');
insert into core.role_permissions(role_id,permission_key) values
 ('30000000-0000-0000-0000-000000000006','sales.dashboard.read');
insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) values
 ('00000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000006','unit',
 '10000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
-- Oráculo aprovado: setembro/2026 parcial até dia 2. Não há distribuição do ajuste.
insert into sales.entries(sale_date,unit_id,payment_method,amount) values
 ('2026-09-01','10000000-0000-0000-0000-000000000001','Stone',100.00),
 ('2026-09-02','10000000-0000-0000-0000-000000000001','Stone',150.00),
 ('2026-09-01','10000000-0000-0000-0000-000000000001','PIX',20.00),
 ('2026-09-02','10000000-0000-0000-0000-000000000001','PIX',30.00);
insert into sales.legacy_monthly_adjustments(competency,unit_id,payment_method,amount,reason)
 values('2026-09-01','10000000-0000-0000-0000-000000000001','Stone',50.00,'VEN-03 oráculo sintético');
insert into sales.month_statuses(competency,is_closed,last_day_with_data,source)
 values('2026-09-01',false,2,'ven03_synthetic');
