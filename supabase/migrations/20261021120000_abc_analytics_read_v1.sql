begin;
-- Curva ABC analytics read model v1 (docs/briefs/ABC_ANALYTICS_V2.md). Read-only: every function
-- requires abc.report.read on the requested unit, reads only published revisions and returns
-- numeric values as text. No new permission, table or write path; Core is not referenced for writes.

-- Ratios (average cost, variations, shares): 20 decimal places, half away from zero (half-up for
-- the non-negative values stored here). Adding a zero with 30 decimal places raises the divisor's
-- display scale WITHOUT rounding it (a cast to numeric(p,30) would round a tiny divisor to zero),
-- so PostgreSQL does not stop at 16 significant digits. Division by zero is null, never an error.
create function abc_private.ratio(p_a numeric,p_b numeric) returns numeric
language sql immutable set search_path='' as $$
 select case when p_a is null or p_b is null or p_b=0 then null
  else trim_scale(round(p_a/(p_b+0.000000000000000000000000000000),20)) end
$$;

-- Same normalization as the browser parser (LT→L, UND→UN); other labels compare as written.
create function abc_private.unit_key(p_label text) returns text
language sql immutable set search_path='' as $$
 select case upper(btrim(p_label)) when 'LT' then 'L' when 'UND' then 'UN' else upper(btrim(p_label)) end
$$;

create function abc_private.require_read(p_unit uuid,p_cost_basis text) returns void
language plpgsql stable set search_path='' as $$
begin
 if p_unit is null or not private.has_unit_permission('abc.report.read',p_unit) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 if p_cost_basis is null or p_cost_basis not in ('NET_PERIOD','GROSS_PERIOD') then
  perform abc_private.fail('Modalidade de custo não suportada');
 end if;
end $$;

-- Current revision of one series, or a stable "no publication" error (P0002).
create function abc_private.current_revision(p_unit uuid,p_cost_basis text,p_competency date) returns abc.report_revisions
language plpgsql stable set search_path='' as $$
declare r abc.report_revisions;
begin
 select v.* into r from abc.report_series s join abc.report_revisions v on v.id=s.current_revision_id
 where s.unit_id=p_unit and s.cost_basis=p_cost_basis and s.competency=p_competency;
 if not found then raise exception 'Competência sem publicação nesta modalidade' using errcode='P0002'; end if;
 return r;
end $$;

-- Totals by calculated class (A, B, C) and the zero-total lines that have no class.
create function abc_private.class_summary(p_revision uuid,p_total numeric) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object(
  'classes',(select jsonb_agg(jsonb_build_object('class',k.cls,'count',coalesce(x.n,0),'total',coalesce(x.t,0)::text,
     'share',abc_private.ratio(coalesce(x.t,0)*100,p_total)::text) order by k.cls)
   from (values('A'),('B'),('C')) k(cls)
   left join (select calculated_class c,count(*)::integer n,sum(total) t from abc.revision_lines
    where revision_id=p_revision group by calculated_class) x on x.c=k.cls),
  'unclassified',(select count(*)::integer from abc.revision_lines where revision_id=p_revision and calculated_class is null))
$$;

-- Executive view of one unit and cost basis: every published competency with its class split.
create function abc.overview(p_unit uuid,p_cost_basis text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u core.units;
begin
 perform abc_private.require_read(p_unit,p_cost_basis);
 select * into u from core.units where id=p_unit;
 return jsonb_build_object(
  'unit',jsonb_build_object('id',u.id,'code',u.code,'name',u.name),
  'cost_basis',p_cost_basis,
  'bases',coalesce((select jsonb_agg(distinct s.cost_basis) from abc.report_series s where s.unit_id=p_unit and s.version>0),'[]'),
  'competencies',coalesce((select jsonb_agg(q.item order by q.competency) from (
    select s.competency,jsonb_build_object('competency',s.competency,'revision_id',r.id,'revision_number',r.number,
     'declared_total',r.declared_total::text,'calculated_total',r.calculated_total::text,'difference',r.difference::text,
     'line_count',r.line_count,'published_at',r.published_at)||abc_private.class_summary(r.id,r.calculated_total) item
    from abc.report_series s join abc.report_revisions r on r.id=s.current_revision_id
    where s.unit_id=p_unit and s.cost_basis=p_cost_basis) q),'[]'));
end $$;

-- Products of the current revision of one competency, with rank, cumulative share and the
-- summaries used by the Products, Categories and Reports areas.
create function abc.competency_products(p_unit uuid,p_cost_basis text,p_competency date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r abc.report_revisions;
begin
 perform abc_private.require_read(p_unit,p_cost_basis);
 r=abc_private.current_revision(p_unit,p_cost_basis,p_competency);
 return jsonb_build_object(
  'revision',jsonb_build_object('id',r.id,'number',r.number,'competency',p_competency,'cost_basis',p_cost_basis,
   'declared_total',r.declared_total::text,'calculated_total',r.calculated_total::text,'line_count',r.line_count,
   'published_at',r.published_at,'abc_method',r.abc_method),
  'summary',abc_private.class_summary(r.id,r.calculated_total)||jsonb_build_object(
   -- ERP class (as printed) × class computed by abc-70-90-inicio-v1; null means absent/zero total.
   'matrix',(select coalesce(jsonb_agg(jsonb_build_object('erp_class',erp_class,'calculated_class',calculated_class,
      'count',n,'total',t::text) order by erp_class nulls last,calculated_class nulls last),'[]')
     from (select erp_class,calculated_class,count(*)::integer n,sum(total) t from abc.revision_lines
      where revision_id=r.id group by erp_class,calculated_class) m),
   -- Spend by unit of measure: totals only; quantities of different units are never added.
   'units',(select coalesce(jsonb_agg(jsonb_build_object('unit',k,'count',n,'quantity',q::text,'total',t::text,
      'share',abc_private.ratio(t*100,r.calculated_total)::text) order by t desc,k),'[]')
     from (select abc_private.unit_key(unit_label) k,count(*)::integer n,sum(quantity) q,sum(total) t
      from abc.revision_lines where revision_id=r.id group by 1) m)),
  'lines',(select coalesce(jsonb_agg(jsonb_build_object('rank',x.rank,'line_no',x.line_no,'code',x.product_code,
     'name',x.product_name,'unit',x.unit_label,'quantity',x.quantity::text,'unit_cost',x.unit_cost::text,'total',x.total::text,
     'avg_cost',abc_private.ratio(x.total,x.quantity)::text,'share',x.share::text,
     'cumulative_share',abc_private.ratio(x.cumulative_before*100,r.calculated_total)::text,
     'erp_class',x.erp_class,'calculated_class',x.calculated_class,'source_row',x.source_row) order by x.rank),'[]')
   from (select l.*,row_number() over(order by l.total desc,l.product_code collate "C")::integer rank
    from abc.revision_lines l where l.revision_id=r.id) x));
end $$;

-- One product (exact ERP code) across the unit's published competencies of a cost basis.
create function abc.product_history(p_unit uuid,p_cost_basis text,p_code text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform abc_private.require_read(p_unit,p_cost_basis);
 return coalesce((select jsonb_agg(jsonb_build_object('competency',s.competency,'revision_id',r.id,
   'revision_number',r.number,'name',l.product_name,'unit',l.unit_label,'quantity',l.quantity::text,
   'unit_cost',l.unit_cost::text,'total',l.total::text,'avg_cost',abc_private.ratio(l.total,l.quantity)::text,
   'share',l.share::text,'erp_class',l.erp_class,'calculated_class',l.calculated_class,'source_row',l.source_row)
   order by s.competency)
  from abc.report_series s join abc.report_revisions r on r.id=s.current_revision_id
  join abc.revision_lines l on l.revision_id=r.id and l.product_code=p_code
  where s.unit_id=p_unit and s.cost_basis=p_cost_basis),'[]');
end $$;

-- Every revision of the unit (current and superseded) for the Imports area.
create function abc.unit_revisions(p_unit uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if p_unit is null or not private.has_unit_permission('abc.report.read',p_unit) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'competency',s.competency,'cost_basis',s.cost_basis,
   'number',r.number,'current',s.current_revision_id=r.id,'reason',r.reason,'published_at',r.published_at,
   'published_by',(select display_name from core.profiles where id=r.published_by),
   'declared_total',r.declared_total::text,'calculated_total',r.calculated_total::text,'line_count',r.line_count,
   'warning_count',jsonb_array_length(r.warnings),'original_name',f.original_name,'sha256',f.sha256,'byte_size',f.byte_size)
   order by r.published_at desc,r.number desc)
  from abc.report_revisions r join abc.report_series s on s.id=r.series_id join abc.source_files f on f.id=r.source_file_id
  where r.unit_id=p_unit),'[]');
end $$;

-- Two competencies of one unit and cost basis, per docs/briefs/ABC_ANALYTICS_V2.md "Regras de
-- comparação" (metricas-v1 of the origin). Products match by exact ERP code only. Average cost
-- P=T/Q; comparable = present in both, same normalized unit, Q>0 in both.
-- price_effect=(P1−P0)·Q1 and quantity_effect=P0·(Q1−Q0) are computed with one rounded division,
-- r=T0·Q1/Q0 (base cost at current quantity): price=T1−r, quantity=r−T0, so each comparable item
-- closes exactly (T1−T0) and rounding never accumulates. Average-cost variation is likewise one
-- division: 100·(T1·Q0−T0·Q1)/(T0·Q1). The bridge adds new, absent and non-comparable items and
-- still reports the residual so any future regression is visible.
create function abc.compare(p_unit uuid,p_cost_basis text,p_base date,p_current date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare rb abc.report_revisions; rc abc.report_revisions; v_items jsonb; v_summary jsonb;
begin
 perform abc_private.require_read(p_unit,p_cost_basis);
 if p_base is null or p_current is null or p_base=p_current then
  perform abc_private.fail('Escolha duas competências diferentes');
 end if;
 rb=abc_private.current_revision(p_unit,p_cost_basis,p_base);
 rc=abc_private.current_revision(p_unit,p_cost_basis,p_current);
 with b as (select product_code code,product_name nm,unit_label un,quantity q,unit_cost pu,total t,erp_class ec,calculated_class cc
   from abc.revision_lines where revision_id=rb.id),
  c as (select product_code code,product_name nm,unit_label un,quantity q,unit_cost pu,total t,erp_class ec,calculated_class cc
   from abc.revision_lines where revision_id=rc.id),
  j as (select coalesce(c.code,b.code) code,coalesce(c.nm,b.nm) nm,b.code is not null hb,c.code is not null hc,
    b.un bun,b.q bq,b.pu bpu,b.t bt,b.ec bec,b.cc bcc,abc_private.ratio(b.t,b.q) bp,
    c.un cun,c.q cq,c.pu cpu,c.t ct,c.ec cec,c.cc ccc,abc_private.ratio(c.t,c.q) cp
   from b full join c on c.code=b.code),
  -- Direction from the exact sign of T1·Q0 − T0·Q1 (never from the rounded averages).
  k as (select j.*,case when not hb then 'new' when not hc then 'absent'
     when abc_private.unit_key(bun)<>abc_private.unit_key(cun) or bq=0 or cq=0 then 'not_comparable'
     when ct*bq>bt*cq then 'up' when ct*bq<bt*cq then 'down' else 'unchanged' end status from j),
  r as (select k.*,status in ('up','down','unchanged') comparable,
    case when status in ('up','down','unchanged') then abc_private.ratio(bt*cq,bq) end rq from k),
  v as (select r.*,
    case when comparable then ct-rq end price_effect,
    case when comparable then rq-bt end quantity_effect,
    case when comparable then abc_private.ratio((ct*bq-bt*cq)*100,bt*cq) end unit_variation,
    case when hb and hc then ct-bt end total_delta,
    case when hb and hc then abc_private.ratio((ct-bt)*100,bt) end total_variation from r),
  m as (select v.*,coalesce(unit_variation>=300 or unit_variation<=-75 or (comparable and bt=0 and ct>0),false) alert from v)
 select
  coalesce(jsonb_agg(jsonb_build_object('code',code,'name',nm,'status',status,
   -- Review heuristics from metricas-v1 (not proof of error): ≥ +300% or ≤ −75% average cost,
   -- or an unexpected zero base cost with a positive current cost (no percentage exists).
   'alert',alert,
   'base',case when hb then jsonb_build_object('unit',bun,'quantity',bq::text,'unit_cost',bpu::text,'total',bt::text,
     'avg_cost',bp::text,'erp_class',bec,'calculated_class',bcc) end,
   'current',case when hc then jsonb_build_object('unit',cun,'quantity',cq::text,'unit_cost',cpu::text,'total',ct::text,
     'avg_cost',cp::text,'erp_class',cec,'calculated_class',ccc) end,
   'unit_variation',unit_variation::text,'total_delta',total_delta::text,'total_variation',total_variation::text,
   'price_effect',price_effect::text,'quantity_effect',quantity_effect::text)
   order by abs(coalesce(total_delta,ct,-bt)) desc,code collate "C"),'[]'),
  jsonb_build_object(
   'counts',jsonb_build_object('base',count(*) filter (where hb),'current',count(*) filter (where hc),
     'up',count(*) filter (where status='up'),'down',count(*) filter (where status='down'),
     'unchanged',count(*) filter (where status='unchanged'),'new',count(*) filter (where status='new'),
     'absent',count(*) filter (where status='absent'),'not_comparable',count(*) filter (where status='not_comparable'),
     'alerts',count(*) filter (where alert)),
   'bridge',jsonb_build_object(
     'price_effect',coalesce(sum(price_effect),0)::text,
     'quantity_effect',coalesce(sum(quantity_effect),0)::text,
     'new',coalesce(sum(ct) filter (where status='new'),0)::text,
     'absent',(-coalesce(sum(bt) filter (where status='absent'),0))::text,
     'not_comparable',coalesce(sum(ct-bt) filter (where status='not_comparable'),0)::text,
     'residual',trim_scale(rc.calculated_total-rb.calculated_total-coalesce(sum(price_effect),0)-coalesce(sum(quantity_effect),0)
       -coalesce(sum(ct) filter (where status='new'),0)+coalesce(sum(bt) filter (where status='absent'),0)
       -coalesce(sum(ct-bt) filter (where status='not_comparable'),0))::text),
   -- Common-basket index: 100·(ΣP1·Q1 / ΣP0·Q1 − 1) over comparable items only.
   'common_basket',jsonb_build_object('items',count(*) filter (where comparable),
     'current_total',coalesce(sum(ct) filter (where comparable),0)::text,
     'index',(abc_private.ratio(sum(ct) filter (where comparable)*100,sum(rq) filter (where comparable))-100)::text),
   -- Impact by the base calculated class (new items have no base class).
   'by_base_class',(select jsonb_agg(jsonb_build_object('class',g.k,'count',g.n,'base_total',g.bt::text,
      'current_total',g.ct::text,'delta',(g.ct-g.bt)::text) order by g.k)
     from (select coalesce(bcc,case when not hb then 'NEW' else 'NONE' end) k,count(*)::integer n,
       coalesce(sum(bt),0) bt,coalesce(sum(ct),0) ct from m group by 1) g))
 into v_items,v_summary
 from m;
 return jsonb_build_object(
  'base',jsonb_build_object('revision_id',rb.id,'number',rb.number,'competency',p_base,'total',rb.calculated_total::text,'line_count',rb.line_count),
  'current',jsonb_build_object('revision_id',rc.id,'number',rc.number,'competency',p_current,'total',rc.calculated_total::text,'line_count',rc.line_count),
  'total_delta',(rc.calculated_total-rb.calculated_total)::text,
  'total_variation',abc_private.ratio((rc.calculated_total-rb.calculated_total)*100,rb.calculated_total)::text,
  'summary',v_summary,'items',v_items);
end $$;

-- Same convention as the v1 migration: helpers are callable only through the definer functions.
revoke all on function abc_private.ratio(numeric,numeric),abc_private.unit_key(text),
 abc_private.require_read(uuid,text),abc_private.current_revision(uuid,text,date),
 abc_private.class_summary(uuid,numeric),abc.overview(uuid,text),abc.competency_products(uuid,text,date),
 abc.product_history(uuid,text,text),abc.unit_revisions(uuid),abc.compare(uuid,text,date,date)
 from public,anon,authenticated;
grant execute on function abc.overview(uuid,text),abc.competency_products(uuid,text,date),
 abc.product_history(uuid,text,text),abc.unit_revisions(uuid),abc.compare(uuid,text,date,date) to authenticated;
commit;
