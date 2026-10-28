begin;
-- VEN-03: motor sem cache. Tabelas privadas e concessões Core preservadas.
-- Helpers puros: arredondamento somente na fronteira JSON (NUMERIC, nunca float).
create function sales_private.money(p_value numeric) returns text
language sql immutable strict set search_path='' as $$ select round(p_value,2)::text $$;
create function sales_private.change(p_current numeric,p_previous numeric) returns numeric
language sql immutable set search_path='' as $$
 select (p_current-p_previous)/nullif(abs(p_previous),0)*100
$$;
create function sales_private.comparison(p_month date,p_cut integer,p_current numeric,p_previous numeric)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('reference_month',p_month,'cutoff_day',p_cut,
 'current_amount',sales_private.money(p_current),'reference_amount',sales_private.money(p_previous),
 'available',p_month is not null and coalesce(p_previous<>0,false),
 'variation_pct',round(sales_private.change(p_current,p_previous),6)::text,
 'trend',case when p_month is null or p_previous is null or p_previous=0 then 'unavailable'
   when sales_private.change(p_current,p_previous)>0.05 then 'up'
   when sales_private.change(p_current,p_previous)<-0.05 then 'down' else 'neutral' end)
$$;

create function public.sales_dashboard(
 p_from date,p_to date,p_units uuid[] default null,p_scope text default 'stone',
 p_daily_month date default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_units uuid[]; v_global boolean; v_result jsonb;
begin
 perform sales_private.authorize('sales.dashboard.read');
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
 or p_from<date '0001-01-01' or p_to>date '9999-12-01'
 or p_from<>date_trunc('month',p_from)::date or p_to<>date_trunc('month',p_to)::date
 or p_from>p_to or p_to>=p_from+interval '24 months'
 or p_scope is null or p_scope not in ('stone','combined')
 or (p_daily_month is not null and (not isfinite(p_daily_month)
   or p_daily_month<>date_trunc('month',p_daily_month)::date or p_daily_month not between p_from and p_to))
 or (p_units is not null and (cardinality(p_units) not between 1 and 100
   or array_position(p_units,null) is not null or array_ndims(p_units)<>1)) then
   raise exception 'Filtros inválidos: até 24 competências e 100 unidades.' using errcode='23514';
 end if;
 if p_units is not null and exists(select 1 from unnest(p_units) u
   where not private.has_unit_permission('sales.dashboard.read',u)) then
   raise exception 'Acesso negado.' using errcode='42501';
 end if;
 select array_agg(id order by id) into v_units from core.units
 where private.has_unit_permission('sales.dashboard.read',id)
 and (p_units is null or id=any(p_units));
 if cardinality(v_units)>100 then
   raise exception 'Selecione até 100 unidades.' using errcode='23514';
 end if;
 v_global:=private.has_global_permission('sales.dashboard.read');
 -- Um único comando produz um snapshot consistente de todos os componentes.
 with movements as materialized (
   select date_trunc('month',e.sale_date)::date competency,e.unit_id,e.payment_method,
     extract(day from e.sale_date)::int as day,e.amount,
     case when p_scope='combined' or e.payment_method='Stone' then e.amount else 0 end shown
   from sales.entries e where e.deleted_at is null and e.unit_id=any(v_units)
     and e.sale_date < p_to+interval '1 month'
   union all
   select a.competency,a.unit_id,a.payment_method,null,a.amount,
     case when p_scope='combined' or a.payment_method='Stone' then a.amount else 0 end
   from sales.legacy_monthly_adjustments a where a.unit_id=any(v_units) and a.competency<=p_to
 ), keys as (
   select competency from movements
   union
   -- Status global nunca cria disponibilidade para atribuições por unidade.
   select competency from sales.month_statuses where v_global and competency<=p_to
 ), totals as (
   select k.competency,
     extract(day from k.competency+interval '1 month - 1 day')::int days_in_month,
     coalesce(sum(m.amount) filter(where m.payment_method='Stone'),0) stone,
     coalesce(sum(m.amount) filter(where m.payment_method='PIX'),0) pix,
     coalesce(sum(m.shown),0) total,
     coalesce(sum(m.shown) filter(where m.day is not null),0) daily_total,
     coalesce(sum(m.shown) filter(where m.day is null),0) adjustment_total,
     greatest(coalesce(max(m.day),0),coalesce(s.last_day_with_data,0)) raw_last_day,
     s.is_closed,case when not v_global and k.competency<>date_trunc('month',timezone('America/Sao_Paulo',now()))::date
       then 'historical_unavailable' when not v_global then 'scoped_dates'
       when s.competency is null then 'derived' else 'snapshot' end status_basis
   from keys k left join movements m using(competency)
   left join sales.month_statuses s on v_global and s.competency=k.competency
   group by k.competency,s.competency,s.last_day_with_data,s.is_closed
 ), statuses as (
   select *,case when status_basis='historical_unavailable' then null
     when is_closed is not null then not is_closed and raw_last_day<days_in_month
     else competency=date_trunc('month',timezone('America/Sao_Paulo',now()))::date
       and raw_last_day<days_in_month end partial
   from totals
 ), months as materialized (
   select *,case when not partial and raw_last_day=0 then days_in_month else raw_last_day end last_day_with_data,
     lag(competency) over(order by competency) reference_month,
     lag(days_in_month) over(order by competency) reference_days,
     lag(total) over(order by competency) reference_total,
     lag(partial) over(order by competency) reference_partial
   from statuses
 ), cuts as (
   select *,case when partial then least(last_day_with_data,reference_days) end cutoff_day
   from months
 ), compared as (
   select c.*,
     case when partial then coalesce((select sum(shown) from movements m
       where m.competency=c.competency and day<=c.cutoff_day),0) else total end comparison_current,
     case when reference_month is null or partial is null then null when partial then coalesce((select sum(shown) from movements m
       where m.competency=c.reference_month and day<=c.cutoff_day),0) else reference_total end comparison_previous,
     case when partial is not null then
       total/nullif(case when partial then last_day_with_data else days_in_month end,0) end daily_average,
     case when partial then daily_total/nullif(last_day_with_data,0)*days_in_month end projection
   from cuts c
 ), visible as materialized (
   select * from compared where competency between p_from and p_to
 ), monthly_json as (
   select v.*,jsonb_build_object('competency',competency,'days_in_month',days_in_month,
     'last_day_with_data',last_day_with_data,'partial',partial,'is_closed',is_closed,'status_basis',status_basis,
     'stone',sales_private.money(stone),'pix',sales_private.money(pix),'total',sales_private.money(total),
     'daily_total',sales_private.money(daily_total),'adjustment_total',sales_private.money(adjustment_total),
     'daily_average',sales_private.money(daily_average),'projection',sales_private.money(projection),
     'projection_is_estimate',projection is not null,
     'comparison',sales_private.comparison(reference_month,cutoff_day,comparison_current,comparison_previous),
     'reconciliation_difference',sales_private.money(total-daily_total-adjustment_total)) payload
   from visible v
 ), cube as materialized (
   select v.competency,u.id unit_id,
     coalesce(sum(m.amount) filter(where payment_method='Stone'),0) stone,
     coalesce(sum(m.amount) filter(where payment_method='PIX'),0) pix,
     coalesce(sum(m.shown),0) total,
     coalesce(sum(m.shown) filter(where day is not null),0) daily_total,
     coalesce(sum(m.shown) filter(where day is null),0) adjustment_total
   from visible v cross join core.units u
   left join movements m on m.competency=v.competency and m.unit_id=u.id
   where u.id=any(v_units) group by v.competency,u.id
 ), ranked as (
   select unit_id,sum(total) total,sum(stone) stone,sum(pix) pix,
     row_number() over(order by sum(total) desc,unit_id) position
   from cube group by unit_id
 ), period as (
   select coalesce(sum(total),0) total,coalesce(sum(stone),0) stone,coalesce(sum(pix),0) pix,
   coalesce(sum(daily_total),0) daily_total,coalesce(sum(adjustment_total),0) adjustment_total,
   sum(total)/nullif(count(*),0) monthly_average,
   case when count(*) filter(where partial is null)=0 then
     sum(total)/nullif(sum(case when partial then last_day_with_data else days_in_month end),0) end daily_average
   from visible
 ), ranking_json as (
   select r.*,jsonb_build_object('unit_id',unit_id,'position',position,'total',sales_private.money(r.total),
     'stone',sales_private.money(r.stone),'pix',sales_private.money(r.pix),
     'share_pct',round(r.total/nullif(p.total,0)*100,6)::text) payload
   from ranked r cross join period p where r.total>0
 ), moves as (
   select v.*,sales_private.change(comparison_current,comparison_previous) variation
   from monthly_json v where not partial and not reference_partial
   and reference_month between p_from and p_to and comparison_previous<>0
 ), daily_focus as (
   select * from visible where competency=coalesce(p_daily_month,(select max(competency) from visible))
 ), daily_months as (
   select competency,days_in_month,last_day_with_data,partial from daily_focus
   union
   select m.competency,m.days_in_month,m.last_day_with_data,m.partial
     from months m join daily_focus f on m.competency=f.reference_month
 ), daily_values as (
   select d.*,g.day,u.id unit_id,
     coalesce(sum(m.amount) filter(where m.payment_method='Stone'),0) stone,
     coalesce(sum(m.amount) filter(where m.payment_method='PIX'),0) pix,
     coalesce(sum(m.shown),0) total
   from daily_months d cross join lateral generate_series(1,d.days_in_month) g(day)
   cross join core.units u left join movements m on m.competency=d.competency and m.day=g.day and m.unit_id=u.id
   where u.id=any(v_units) group by d.competency,d.days_in_month,d.last_day_with_data,d.partial,g.day,u.id
 ), daily_cumulative as (
   select *,sum(total) over(partition by competency,unit_id order by day) cumulative,
     sum(stone) over(partition by competency,unit_id order by day) cumulative_stone,
     sum(pix) over(partition by competency,unit_id order by day) cumulative_pix
   from daily_values
 ), daily_totals as (
   select competency,day,sum(stone) stone,sum(pix) pix,sum(total) total,
     sum(cumulative) cumulative,sum(cumulative_stone) cumulative_stone,sum(cumulative_pix) cumulative_pix
   from daily_cumulative group by competency,day
 )
 select jsonb_build_object('contract_version',1,
   'filters',jsonb_build_object('from',p_from,'to',p_to,'unit_ids',to_jsonb(v_units),'scope',p_scope),
   'units',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'active',active) order by id),'[]')
     from core.units where id=any(v_units)),
   'metadata',jsonb_build_object('global_status_visible',v_global,'money_scale',2,'ratio_scale',6,
     'rounding','half_away_from_zero','first_available_month',(select min(competency) from months),
     'latest_available_month',(select max(competency) from months),
     'missing_months',(select coalesce(jsonb_agg(g::date order by g),'[]')
       from generate_series(p_from::timestamp,p_to::timestamp,interval '1 month') g
       where not exists(select 1 from visible where competency=g::date))),
   'summary',jsonb_build_object('total',sales_private.money(p.total),'stone',sales_private.money(p.stone),
     'pix',sales_private.money(p.pix),'daily_total',sales_private.money(p.daily_total),
     'adjustment_total',sales_private.money(p.adjustment_total),
     'daily_average',sales_private.money(p.daily_average),'monthly_average',sales_private.money(p.monthly_average),
     'latest',(select payload from monthly_json order by competency desc limit 1),
     'best_closed',(select payload from monthly_json where not partial order by total desc,competency limit 1),
     'leader',(select payload from ranking_json order by position limit 1),
     'top_two_share_pct',round((select sum(total) from ranked where position<=2)/nullif(p.total,0)*100,6)::text,
     'reconciliation_difference',sales_private.money(p.total-p.daily_total-p.adjustment_total)),
   'months',(select coalesce(jsonb_agg(payload order by competency),'[]') from monthly_json),
   'ranking',(select coalesce(jsonb_agg(payload order by position),'[]') from ranking_json),
   -- Esta matriz é a fonte única para empilhadas, evolução por unidade e heatmap.
   'unit_months',(select coalesce(jsonb_agg(jsonb_build_object('competency',competency,'unit_id',unit_id,
     'stone',sales_private.money(stone),'pix',sales_private.money(pix),'total',sales_private.money(total),
     'daily_total',sales_private.money(daily_total),'adjustment_total',sales_private.money(adjustment_total),
     'intensity',round(total/greatest((select max(total) from cube),1),6)::text)
     order by competency,unit_id),'[]') from cube),
   'payment_mix',jsonb_build_object('stone',sales_private.money(p.stone),'pix',sales_private.money(p.pix),
     'stone_share_pct',round(p.stone/nullif(p.stone+p.pix,0)*100,6)::text,
     'pix_share_pct',round(p.pix/nullif(p.stone+p.pix,0)*100,6)::text),
   'daily',jsonb_build_object('competency',(select competency from daily_focus),
     'reference_month',(select reference_month from daily_focus),
     'cutoff_day',(select least(case when partial is false then days_in_month else last_day_with_data end,reference_days) from daily_focus),
     'totals',(select coalesce(jsonb_agg(jsonb_build_object('competency',competency,'day',day,
       'sale_date',competency+(day-1),'stone',sales_private.money(stone),'pix',sales_private.money(pix),
       'total',sales_private.money(total),'cumulative',sales_private.money(cumulative),
       'cumulative_stone',sales_private.money(cumulative_stone),'cumulative_pix',sales_private.money(cumulative_pix))
       order by competency,day),'[]') from daily_totals),
     'points',(select coalesce(jsonb_agg(jsonb_build_object('competency',competency,
       'sale_date',competency+(day-1),'day',day,'unit_id',unit_id,'has_elapsed',coalesce(not partial,false) or day<=last_day_with_data,
       'stone',sales_private.money(stone),'pix',sales_private.money(pix),'total',sales_private.money(total),
       'cumulative',sales_private.money(cumulative),'cumulative_stone',sales_private.money(cumulative_stone),
       'cumulative_pix',sales_private.money(cumulative_pix)) order by competency,day,unit_id),'[]') from daily_cumulative)),
   'insights',jsonb_build_object(
     'strongest_advance',(select payload from moves order by variation desc,competency limit 1),
     'largest_decline',(select payload from moves where variation<0 order by variation,competency limit 1),
     'pace',(select jsonb_build_object('competency',competency,'projection',sales_private.money(projection),
       'is_estimate',projection is not null,'reference_month',reference_month,
       'projected_variation_pct',round(sales_private.change(projection,reference_total),6)::text,
       'comparison',sales_private.comparison(reference_month,cutoff_day,comparison_current,comparison_previous))
       from visible order by competency desc limit 1))) into v_result from period p;
 return v_result;
end $$;

revoke all on function sales_private.money(numeric),sales_private.change(numeric,numeric),
 sales_private.comparison(date,integer,numeric,numeric) from public,anon,authenticated;
revoke all on function public.sales_dashboard(date,date,uuid[],text,date) from public,anon,authenticated;
grant execute on function public.sales_dashboard(date,date,uuid[],text,date) to authenticated;
comment on function public.sales_dashboard(date,date,uuid[],text,date) is
 'VEN-03: sales.dashboard.read; 24 meses/100 unidades; NUMERIC exato; dinheiro string; diário sem ajustes.';
notify pgrst,'reload schema';
commit;
