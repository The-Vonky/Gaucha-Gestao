begin;

create index bookings_direct_history_order
  on room_booking.bookings (starts_at desc, id desc) where request_id is null;

create function public.room_booking_direct_history(
  p_status text default null, p_from date default null, p_to date default null,
  p_before_start timestamptz default null, p_before_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform room_booking.authorize('room_booking.manage');
  if (p_status is not null and p_status not in ('confirmed', 'cancelled'))
    or p_from not between date '0001-01-01' and date '9999-12-31'
    or p_to not between date '0001-01-01' and date '9999-12-31'
    or p_to < p_from
    or (p_before_start is null) <> (p_before_id is null)
    or (p_before_start is not null and not isfinite(p_before_start)) then
    raise exception 'Filtros de histórico inválidos.' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.starts_at desc, q.id desc), '[]') into result
  from (
    select b.id, b.booked_for, b.starts_at, b.ends_at, b.status, b.created_at, b.updated_at,
      b.cancelled_at, b.cancel_reason, b.secretary_notes, creator.display_name as created_by_name,
      canceller.display_name as cancelled_by_name
    from room_booking.bookings b
    join core.profiles creator on creator.id = b.created_by
    left join core.profiles canceller on canceller.id = b.cancelled_by
    where b.request_id is null
      and (p_status is null or b.status = p_status)
      and (p_from is null or b.starts_at >= p_from::timestamp at time zone 'America/Sao_Paulo')
      and (p_to is null or b.starts_at < (p_to + 1)::timestamp at time zone 'America/Sao_Paulo')
      and (p_before_start is null or (b.starts_at, b.id) < (p_before_start, p_before_id))
    order by b.starts_at desc, b.id desc limit 26
  ) q;
  return jsonb_build_object(
    'items', case when jsonb_array_length(result) > 25 then result - 25 else result end,
    'has_more', jsonb_array_length(result) > 25
  );
end $$;

revoke all on function public.room_booking_direct_history(text, date, date, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.room_booking_direct_history(text, date, date, timestamptz, uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
