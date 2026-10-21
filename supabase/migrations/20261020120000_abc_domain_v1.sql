begin;
-- Curva ABC Domain v1 (docs/briefs/ABC_DOMAIN_V1.md). Depends on Core only; Core never
-- references this schema. The browser parses the ERP workbook; every rule that can be checked
-- from the submitted lines is re-validated here, and ABC classes are computed only here.
create schema abc;
create schema abc_private;
revoke all on schema abc, abc_private from public;
grant usage on schema abc to authenticated;
alter default privileges in schema abc revoke execute on functions from public;
alter default privileges in schema abc_private revoke execute on functions from public;

insert into core.permissions(key,domain,resource,action,description) values
('abc.report.read','abc','report','read','Consultar relatórios Curva ABC'),
('abc.report.publish','abc','report','publish','Publicar e substituir relatórios Curva ABC');
insert into core.roles(key,name,description,system,global_only) values
('costs','Costs','Publicação e consulta da Curva ABC',true,false),
('costs_viewer','Costs Viewer','Consulta da Curva ABC',true,false);
-- The initial catalog's cross join does not reach permissions added later.
insert into core.role_permissions(role_id,permission_key)
select r.id,p.key from core.roles r cross join core.permissions p
where p.domain='abc' and r.system and r.key in ('platform_administrator','costs');
insert into core.role_permissions(role_id,permission_key)
select r.id,'abc.report.read' from core.roles r where r.system and r.key='costs_viewer';

create table abc.source_files(
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references core.units(id),
 object_key text generated always as ('units/'||unit_id::text||'/abc/'||id::text||'.xlsx') stored unique,
 status text not null default 'pending' check(status in ('pending','ready')),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 byte_size integer not null check(byte_size between 1 and 10485760),
 original_name text not null check(char_length(original_name) between 1 and 255
  and original_name !~ '[\u0000-\u001f\u007f/\\]' and lower(original_name) like '%.xlsx'),
 created_by uuid not null references core.profiles(id) default auth.uid(),
 created_at timestamptz not null default clock_timestamp(),
 ready_at timestamptz,
 check((status='ready')=(ready_at is not null))
);
create index source_files_unit on abc.source_files(unit_id);

create table abc.report_series(
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references core.units(id),
 competency date not null check(competency=date_trunc('month',competency)::date),
 cost_basis text not null check(cost_basis in ('NET_PERIOD','GROSS_PERIOD')),
 current_revision_id uuid,
 version integer not null default 0 check(version>=0),
 created_at timestamptz not null default clock_timestamp(),
 unique(unit_id,competency,cost_basis),
 check((version=0)=(current_revision_id is null))
);

create table abc.report_revisions(
 id uuid primary key default gen_random_uuid(),
 series_id uuid not null references abc.report_series(id),
 unit_id uuid not null references core.units(id),
 number integer not null check(number>=1),
 parent_revision_id uuid references abc.report_revisions(id),
 source_file_id uuid not null unique references abc.source_files(id),
 reason text check(reason is null or char_length(btrim(reason)) between 1 and 1000),
 period_start date not null, period_end date not null,
 cost_basis_text text not null check(char_length(btrim(cost_basis_text)) between 1 and 200),
 declared_total numeric not null, calculated_total numeric not null, difference numeric not null,
 parser_version text not null check(char_length(parser_version) between 1 and 40),
 abc_method text not null check(abc_method='abc-70-90-inicio-v1'),
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 line_count integer not null check(line_count>=1),
 warnings jsonb not null default '[]' check(jsonb_typeof(warnings)='array'),
 published_by uuid not null references core.profiles(id) default auth.uid(),
 published_at timestamptz not null default clock_timestamp(),
 unique(series_id,number),
 check((number=1)=(parent_revision_id is null)),
 check(number=1 or reason is not null)
);
alter table abc.report_series add foreign key(current_revision_id) references abc.report_revisions(id);
create index report_revisions_unit on abc.report_revisions(unit_id);

create table abc.revision_lines(
 revision_id uuid not null references abc.report_revisions(id),
 unit_id uuid not null references core.units(id),
 line_no integer not null check(line_no>=1),
 product_code text not null check(char_length(product_code) between 1 and 60),
 product_name text not null check(char_length(product_name)<=500),
 unit_label text not null check(char_length(unit_label)<=40),
 quantity numeric not null check(quantity>=0),
 unit_cost numeric not null check(unit_cost>=0),
 total numeric not null check(total>=0),
 source_share numeric,
 erp_class text check(erp_class in ('A','B','C')),
 calculated_class text check(calculated_class in ('A','B','C')),
 share numeric, cumulative_before numeric,
 source_sheet text not null check(char_length(source_sheet) between 1 and 31),
 source_row integer not null check(source_row>=1),
 primary key(revision_id,line_no),
 unique(revision_id,product_code)
);
create index revision_lines_unit on abc.revision_lines(unit_id);

-- Published history is immutable, including for the function owner.
create function abc_private.forbid_change() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Published ABC revisions are immutable' using errcode='55000'; end $$;
create trigger revisions_immutable before update or delete on abc.report_revisions
 for each row execute function abc_private.forbid_change();
create trigger lines_immutable before update or delete on abc.revision_lines
 for each row execute function abc_private.forbid_change();
create trigger lines_no_truncate before truncate on abc.revision_lines
 for each statement execute function abc_private.forbid_change();
create trigger revisions_no_truncate before truncate on abc.report_revisions
 for each statement execute function abc_private.forbid_change();

create function abc_private.log(p_action text,p_entity text,p_id uuid,p_unit uuid,p_after jsonb,p_metadata jsonb default '{}')
returns void language sql security definer set search_path='' as $$
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,after_data,metadata)
 values(auth.uid(),'abc',p_action,p_entity,p_id::text,p_unit,p_after,p_metadata)
$$;

-- Canonical decimal text: digits, optional fraction without trailing zeros. Rejects NaN,
-- infinities, signs, exponents and thousands separators. Null when the value is invalid.
create function abc_private.decimal_value(p_value jsonb) returns numeric
language plpgsql immutable set search_path='' as $$
declare t text;
begin
 if p_value is null or jsonb_typeof(p_value)<>'string' then return null; end if;
 t=p_value#>>'{}';
 if t !~ '^(0|[1-9][0-9]{0,29})(\.[0-9]{0,23}[1-9])?$' then return null; end if;
 return t::numeric;
end $$;

create function abc_private.int_value(p_value jsonb) returns integer
language sql immutable set search_path='' as $$
 select case when p_value is not null and jsonb_typeof(p_value)='number' and (p_value#>>'{}') ~ '^[1-9][0-9]{0,8}$'
  then (p_value#>>'{}')::integer end
$$;

create function abc_private.clean_text(p_value jsonb,p_max integer,p_allow_empty boolean) returns text
language sql immutable set search_path='' as $$
 select case when p_value is not null and jsonb_typeof(p_value)='string'
  and char_length(p_value#>>'{}')<=p_max and (p_allow_empty or char_length(btrim(p_value#>>'{}'))>0)
  and (p_value#>>'{}') !~ '[\u0000-\u001f\u007f]' then p_value#>>'{}' end
$$;

create function abc_private.fail(p_message text) returns void language plpgsql set search_path='' as $$
begin raise exception '%',p_message using errcode='23514'; end $$;

-- Mirrors abc/import/contentHash.ts. Any change requires a new parser_version.
create function abc_private.content_hash(p_header text[],p_subtotals text[],p_lines text[]) returns text
language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(array_to_string(
  array['abc-content-v1',array_to_string(p_header,chr(31))]||p_subtotals||p_lines,chr(30)),'UTF8')),'hex')
$$;

create function abc.begin_source_upload(p_unit uuid,p_name text,p_sha256 text,p_size bigint)
returns table(file_id uuid,object_key text) language plpgsql security definer set search_path='' as $$
declare r abc.source_files;
begin
 if not private.has_unit_permission('abc.report.publish',p_unit)
  or not exists(select 1 from core.units where id=p_unit and active) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 insert into abc.source_files(unit_id,sha256,byte_size,original_name)
 values(p_unit,lower(p_sha256),p_size,p_name) returning * into r;
 return query select r.id,r.object_key;
end $$;

create function abc.confirm_source_upload(p_file uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f abc.source_files; m jsonb;
begin
 select * into f from abc.source_files where id=p_file for update;
 if not found or f.created_by is distinct from auth.uid()
  or not private.has_unit_permission('abc.report.publish',f.unit_id) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 if f.status='ready' then return; end if;
 if f.created_at<=clock_timestamp()-interval '1 hour' then raise exception 'Upload expired' using errcode='55000'; end if;
 select o.metadata into m from storage.objects o
 where o.bucket_id='abc-source-files' and o.name=f.object_key and o.owner_id=auth.uid()::text;
 if not found or (m->>'size') is distinct from f.byte_size::text
  or (m->>'mimetype') is distinct from 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then
  raise exception 'Uploaded object does not match' using errcode='23514';
 end if;
 update abc.source_files set status='ready',ready_at=clock_timestamp() where id=f.id;
end $$;

-- Publishes one parsed report as a new immutable revision of its series, atomically.
-- p_expected_version is the series version the user reviewed (0 when the series is new).
create function abc.publish_revision(p_file uuid,p_payload jsonb,p_expected_version integer,
 p_reason text default null,p_accept_warnings boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 f abc.source_files; u core.units; s abc.report_series; cur abc.report_revisions; rev abc.report_revisions;
 v_start date; v_end date; v_basis text; v_basis_text text; v_declared numeric; v_parser text;
 v_sum numeric; v_count integer; v_hash text; v_warnings jsonb; v_client_warnings jsonb; v_reason text;
 v_existing uuid; v_unit_code text; v_bad integer;
begin
 select * into f from abc.source_files where id=p_file for update;
 if not found or not private.has_unit_permission('abc.report.publish',f.unit_id) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 if f.status<>'ready' then perform abc_private.fail('O arquivo original não foi confirmado'); end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then perform abc_private.fail('Relatório inválido'); end if;

 -- Unit: the ERP branch code is the Core unit code (exact text, leading zeros preserved).
 v_unit_code=abc_private.clean_text(p_payload->'unit_code',40,false);
 select * into u from core.units where code=v_unit_code;
 if not found or not u.active or u.id<>f.unit_id then
  perform abc_private.fail('A filial do relatório não corresponde à unidade selecionada');
 end if;
 if abc_private.clean_text(p_payload->'file_sha256',64,false) is distinct from f.sha256 then
  perform abc_private.fail('O relatório não corresponde ao arquivo enviado');
 end if;

 -- Period: one whole calendar month.
 begin
  v_start=(p_payload->>'period_start')::date; v_end=(p_payload->>'period_end')::date;
 exception when others then v_start=null; end;
 if v_start is null or v_end is null or v_start<>date_trunc('month',v_start)::date
  or v_end<>(date_trunc('month',v_start)+interval '1 month - 1 day')::date then
  perform abc_private.fail('O período deve ser um mês completo');
 end if;
 v_basis=p_payload->>'cost_basis';
 if v_basis is null or v_basis not in ('NET_PERIOD','GROSS_PERIOD') then perform abc_private.fail('Modalidade de custo não suportada'); end if;
 v_basis_text=abc_private.clean_text(p_payload->'cost_basis_text',200,false);
 v_parser=abc_private.clean_text(p_payload->'parser_version',40,false);
 v_declared=abc_private.decimal_value(p_payload->'declared_total');
 if v_basis_text is null or v_parser is null or v_declared is null then perform abc_private.fail('Cabeçalho do relatório incompleto'); end if;
 v_client_warnings=coalesce(p_payload->'warnings','[]');
 if jsonb_typeof(v_client_warnings)<>'array' or jsonb_array_length(v_client_warnings)>50
  or exists(select 1 from jsonb_array_elements(v_client_warnings) w where abc_private.clean_text(w,200,false) is null) then
  perform abc_private.fail('Avisos inválidos');
 end if;

 if jsonb_typeof(p_payload->'lines')<>'array' or jsonb_array_length(p_payload->'lines') not between 1 and 20000 then
  perform abc_private.fail('O relatório deve ter entre 1 e 20.000 produtos');
 end if;
 drop table if exists pg_temp.abc_lines;
 create temporary table pg_temp.abc_lines on commit drop as
 select abc_private.int_value(e.value->'line_no') as line_no,
  abc_private.clean_text(e.value->'code',60,false) as code,
  abc_private.clean_text(e.value->'name',500,true) as name,
  abc_private.clean_text(e.value->'unit',40,true) as unit,
  abc_private.decimal_value(e.value->'quantity') as quantity,
  abc_private.decimal_value(e.value->'unit_cost') as unit_cost,
  abc_private.decimal_value(e.value->'total') as total,
  e.value->'source_share' as source_share_raw,
  abc_private.decimal_value(e.value->'source_share') as source_share,
  e.value->'erp_class' as erp_class_raw, e.value->>'erp_class' as erp_class,
  abc_private.clean_text(e.value->'sheet',31,false) as sheet,
  abc_private.int_value(e.value->'row') as source_row
 from jsonb_array_elements(p_payload->'lines') e;

 select count(*) into v_bad from abc_lines where line_no is null or code is null or name is null or unit is null
  or sheet is null or source_row is null or quantity is null or unit_cost is null or total is null
  or (coalesce(jsonb_typeof(source_share_raw),'null')<>'null' and source_share is null)
  or (coalesce(jsonb_typeof(erp_class_raw),'null')<>'null' and coalesce(erp_class,'') not in ('A','B','C'));
 if v_bad>0 then perform abc_private.fail('Há produtos com campos ausentes, inválidos ou negativos'); end if;
 if (select count(distinct line_no) from abc_lines)<>(select count(*) from abc_lines) then perform abc_private.fail('Linhas repetidas no relatório'); end if;
 if (select count(distinct code) from abc_lines)<>(select count(*) from abc_lines) then perform abc_private.fail('Código de produto duplicado'); end if;
 if exists(select 1 from abc_lines where quantity=0 and total>0) then perform abc_private.fail('Produto com quantidade zero e custo positivo'); end if;
 if exists(select 1 from abc_lines where abs(total-quantity*unit_cost)>=0.01) then
  perform abc_private.fail('Custo total diferente de quantidade × custo unitário');
 end if;

 select coalesce(sum(total),0),count(*) into v_sum,v_count from abc_lines;
 if abs(v_declared-v_sum)>=0.05 then perform abc_private.fail('A soma dos produtos não confere com o Total Geral'); end if;

 -- ERP class subtotals: one per class present, each matching its group.
 if jsonb_typeof(p_payload->'subtotals') is distinct from 'array'
  or exists(select 1 from jsonb_array_elements(p_payload->'subtotals') x
   where x->>'class' is null or x->>'class' not in ('A','B','C') or abc_private.decimal_value(x->'total') is null)
  or (select count(distinct x->>'class') from jsonb_array_elements(p_payload->'subtotals') x)<>jsonb_array_length(p_payload->'subtotals')
  or exists(select 1 from (select distinct erp_class from abc_lines where erp_class is not null) c
   where not exists(select 1 from jsonb_array_elements(p_payload->'subtotals') x where x->>'class'=c.erp_class))
  or exists(select 1 from jsonb_array_elements(p_payload->'subtotals') x
   where abs(abc_private.decimal_value(x->'total')-coalesce((select sum(total) from abc_lines where erp_class=x->>'class'),0))>=0.05) then
  perform abc_private.fail('Subtotal de curva ERP ausente ou divergente');
 end if;

 v_hash=abc_private.content_hash(
  array[v_unit_code,v_start::text,v_end::text,v_basis,v_basis_text,v_declared::text],
  coalesce((select array_agg(concat_ws(chr(31),'S',x->>'class',x->>'total') order by x->>'class')
   from jsonb_array_elements(p_payload->'subtotals') x),'{}'),
  (select array_agg(concat_ws(chr(31),'L',line_no::text,code,name,unit,quantity::text,unit_cost::text,total::text,
    coalesce(source_share::text,''),coalesce(erp_class,''),sheet,source_row::text) order by line_no) from abc_lines));
 if abc_private.clean_text(p_payload->'content_hash',64,false) is distinct from v_hash then
  perform abc_private.fail('Conteúdo do relatório alterado após a prévia');
 end if;

 -- Series lock serializes concurrent publishers of the same unit/month/basis.
 insert into abc.report_series(unit_id,competency,cost_basis) values(u.id,v_start,v_basis)
 on conflict(unit_id,competency,cost_basis) do nothing;
 select * into s from abc.report_series where unit_id=u.id and competency=v_start and cost_basis=v_basis for update;
 -- Same original already published in this series: idempotent.
 select r.id into v_existing from abc.report_revisions r join abc.source_files sf on sf.id=r.source_file_id
 where r.series_id=s.id and sf.sha256=f.sha256 and r.content_hash=v_hash limit 1;
 if v_existing is not null then return v_existing; end if;
 if p_expected_version is distinct from s.version then raise exception 'Concurrent change' using errcode='40001'; end if;

 -- Warnings the database can derive; each requires explicit acceptance.
 select coalesce(jsonb_agg(w),'[]') into v_warnings from (
  select 'Percentual da fonte divergente na linha '||line_no as w from abc_lines
   where v_sum>0 and source_share is not null and abs(source_share-total*100/v_sum)>0.01
  union all select 'Quantidade positiva com custo zero na linha '||line_no from abc_lines where quantity>0 and total=0
  union all select 'Substitui a revisão vigente' where s.current_revision_id is not null
 ) x;
 v_warnings=v_warnings||v_client_warnings;
 if jsonb_array_length(v_warnings)>0 and not coalesce(p_accept_warnings,false) then
  raise exception 'Warnings must be accepted' using errcode='23514', detail=v_warnings::text;
 end if;
 v_reason=nullif(btrim(coalesce(p_reason,'')),'');
 if s.current_revision_id is not null and v_reason is null then perform abc_private.fail('Informe o motivo da substituição'); end if;

 if s.current_revision_id is not null then select * into cur from abc.report_revisions where id=s.current_revision_id; end if;
 insert into abc.report_revisions(series_id,unit_id,number,parent_revision_id,source_file_id,reason,period_start,period_end,
  cost_basis_text,declared_total,calculated_total,difference,parser_version,abc_method,content_hash,line_count,warnings)
 values(s.id,u.id,coalesce(cur.number,0)+1,cur.id,f.id,v_reason,v_start,v_end,v_basis_text,v_declared,v_sum,v_declared-v_sum,
  v_parser,'abc-70-90-inicio-v1',v_hash,v_count,v_warnings)
 returning * into rev;

 -- abc-70-90-inicio-v1: rank by total desc, then code; class by the cumulative total before
 -- the item, compared in money (no rounded percentages). Zero totals get no class.
 insert into abc.revision_lines(revision_id,unit_id,line_no,product_code,product_name,unit_label,quantity,unit_cost,total,
  source_share,erp_class,calculated_class,share,cumulative_before,source_sheet,source_row)
 select rev.id,u.id,l.line_no,l.code,l.name,l.unit,l.quantity,l.unit_cost,l.total,l.source_share,l.erp_class,
  case when v_sum=0 or l.total=0 then null when k.before<v_sum*0.7 then 'A' when k.before<v_sum*0.9 then 'B' else 'C' end,
  case when v_sum=0 then null else l.total*100/v_sum end,
  case when v_sum=0 or l.total=0 then null else k.before end,
  l.sheet,l.source_row
 from abc_lines l join (
  select line_no,coalesce(sum(total) over(order by total desc,code collate "C" rows between unbounded preceding and 1 preceding),0) as before
  from abc_lines) k on k.line_no=l.line_no;

 update abc.report_series set current_revision_id=rev.id,version=version+1 where id=s.id;
 perform abc_private.log('revision.publish','report_revision',rev.id,u.id,
  jsonb_build_object('series_id',s.id,'number',rev.number,'competency',v_start,'cost_basis',v_basis,
   'source_file_id',f.id,'content_hash',v_hash,'line_count',v_count),
  jsonb_build_object('reason',v_reason,'parent_revision_id',cur.id));
 return rev.id;
end $$;

-- Records the result of re-parsing the stored original in a reader's browser.
create function abc.record_file_check(p_revision uuid,p_content_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r abc.report_revisions; ok boolean;
begin
 select * into r from abc.report_revisions where id=p_revision;
 if not found or not private.has_unit_permission('abc.report.read',r.unit_id) then raise exception 'Forbidden' using errcode='42501'; end if;
 ok=r.content_hash=lower(coalesce(p_content_hash,''));
 perform abc_private.log(case when ok then 'revision.file_check_ok' else 'revision.file_check_mismatch' end,
  'report_revision',r.id,r.unit_id,null,jsonb_build_object('content_hash',lower(coalesce(p_content_hash,''))));
 return ok;
end $$;

create function abc.units() returns table(unit_id uuid,code text,name text,series_count integer,last_competency date,can_publish boolean)
language sql stable security definer set search_path='' as $$
 select u.id,u.code,u.name,
  (select count(*)::integer from abc.report_series s where s.unit_id=u.id and s.version>0),
  (select max(s.competency) from abc.report_series s where s.unit_id=u.id and s.version>0),
  private.has_unit_permission('abc.report.publish',u.id)
 from core.units u where u.active and private.has_unit_permission('abc.report.read',u.id)
 order by u.name,u.code
$$;

-- Numeric values are returned as text so the browser never turns money into binary floats.
create function abc.unit_series(p_unit uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.has_unit_permission('abc.report.read',p_unit) then raise exception 'Forbidden' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'series_id',s.id,'competency',s.competency,'cost_basis',s.cost_basis,'version',s.version,
   'revision_id',r.id,'revision_number',r.number,'declared_total',r.declared_total::text,
   'calculated_total',r.calculated_total::text,'line_count',r.line_count,'published_at',r.published_at)
  order by s.competency desc,s.cost_basis)
  from abc.report_series s join abc.report_revisions r on r.id=s.current_revision_id where s.unit_id=p_unit),'[]');
end $$;

create function abc.revision_detail(p_revision uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r abc.report_revisions; s abc.report_series; u core.units; f abc.source_files;
begin
 select * into r from abc.report_revisions where id=p_revision;
 if not found or not private.has_unit_permission('abc.report.read',r.unit_id) then raise exception 'Forbidden' using errcode='42501'; end if;
 select * into s from abc.report_series where id=r.series_id;
 select * into u from core.units where id=r.unit_id;
 select * into f from abc.source_files where id=r.source_file_id;
 return jsonb_build_object(
  'id',r.id,'number',r.number,'reason',r.reason,'current',s.current_revision_id=r.id,
  'series',jsonb_build_object('id',s.id,'competency',s.competency,'cost_basis',s.cost_basis,'version',s.version),
  'unit',jsonb_build_object('id',u.id,'code',u.code,'name',u.name),
  'period_start',r.period_start,'period_end',r.period_end,'cost_basis_text',r.cost_basis_text,
  'declared_total',r.declared_total::text,'calculated_total',r.calculated_total::text,'difference',r.difference::text,
  'parser_version',r.parser_version,'abc_method',r.abc_method,'content_hash',r.content_hash,'warnings',r.warnings,
  'published_at',r.published_at,
  'published_by',(select display_name from core.profiles where id=r.published_by),
  'file',jsonb_build_object('object_key',f.object_key,'original_name',f.original_name,'sha256',f.sha256,'byte_size',f.byte_size),
  'history',(select jsonb_agg(jsonb_build_object('id',h.id,'number',h.number,'reason',h.reason,'published_at',h.published_at,
    'declared_total',h.declared_total::text) order by h.number desc) from abc.report_revisions h where h.series_id=s.id),
  'lines',(select jsonb_agg(jsonb_build_object('line_no',l.line_no,'code',l.product_code,'name',l.product_name,'unit',l.unit_label,
    'quantity',l.quantity::text,'unit_cost',l.unit_cost::text,'total',l.total::text,'source_share',l.source_share::text,
    'erp_class',l.erp_class,'calculated_class',l.calculated_class,'share',l.share::text) order by l.total desc,l.product_code collate "C")
   from abc.revision_lines l where l.revision_id=r.id));
end $$;

create function abc_private.can_upload_source_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from abc.source_files f where f.object_key=p_name and f.status='pending'
  and f.created_by=auth.uid() and f.created_at>now()-interval '1 hour'
  and private.has_unit_permission('abc.report.publish',f.unit_id))
$$;
create function abc_private.can_read_source_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from abc.source_files f where f.object_key=p_name and f.status='ready'
  and private.has_unit_permission('abc.report.read',f.unit_id))
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('abc-source-files','abc-source-files',false,10485760,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
-- No UPDATE/DELETE policies: originals are write-once and never removed by clients.
create policy abc_source_insert on storage.objects for insert to authenticated
 with check(bucket_id='abc-source-files' and abc_private.can_upload_source_object(name));
create policy abc_source_read on storage.objects for select to authenticated
 using(bucket_id='abc-source-files' and abc_private.can_read_source_object(name));

-- Direct reads follow the same unit scope; all writes go through the functions above.
grant select on abc.source_files,abc.report_series,abc.report_revisions,abc.revision_lines to authenticated;
alter table abc.source_files enable row level security;
alter table abc.report_series enable row level security;
alter table abc.report_revisions enable row level security;
alter table abc.revision_lines enable row level security;
create policy source_files_read on abc.source_files for select to authenticated
 using(status='ready' and private.has_unit_permission('abc.report.read',unit_id));
create policy series_read on abc.report_series for select to authenticated
 using(private.has_unit_permission('abc.report.read',unit_id));
create policy revisions_read on abc.report_revisions for select to authenticated
 using(private.has_unit_permission('abc.report.read',unit_id));
create policy lines_read on abc.revision_lines for select to authenticated
 using(private.has_unit_permission('abc.report.read',unit_id));

revoke all on all functions in schema abc, abc_private from public,anon,authenticated;
grant usage on schema abc_private to authenticated;
grant execute on function abc_private.can_upload_source_object(text),abc_private.can_read_source_object(text) to authenticated;
grant execute on function abc.begin_source_upload(uuid,text,text,bigint),abc.confirm_source_upload(uuid),
 abc.publish_revision(uuid,jsonb,integer,text,boolean),abc.record_file_check(uuid,text),
 abc.units(),abc.unit_series(uuid),abc.revision_detail(uuid) to authenticated;
commit;
