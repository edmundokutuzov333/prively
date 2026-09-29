-- Phase 5: bill only completed minutes and keep idempotency per minute.

create or replace function public.charge_active_live_minutes()
returns integer
language plpgsql
security definer
set search_path=public
as $function$
declare
  p record;
  minute_no integer;
  inserted integer;
  charged integer:=0;
begin
  for p in
    select lp.session_id,lp.participant_id,lp.joined_at,ls.channel_id,
           coalesce(ls.per_minute_price,0) price
    from public.live_participants lp
    join public.live_sessions ls on ls.id=lp.session_id
    where lp.status='active'
      and lp.left_at is null
      and ls.status='live'
      and coalesce(ls.per_minute_price,0)>0
      and now() >= lp.joined_at + interval '1 minute'
    for update of lp skip locked
  loop
    minute_no:=floor(extract(epoch from(now()-p.joined_at))/60)::integer;
    if minute_no < 1 then continue; end if;

    insert into public.live_billing_ticks(session_id,payer_id,minute_index,amount)
    values(p.session_id,p.participant_id,minute_no,p.price)
    on conflict do nothing;
    get diagnostics inserted=row_count;
    if inserted=0 then continue; end if;

    begin
      perform public._spend_on_channel(
        p.participant_id,p.channel_id,p.price,'live_minute','live_session',
        p.session_id,'live:'||p.session_id::text||':'||p.participant_id::text||':'||minute_no::text
      );
      charged:=charged+1;
    exception when others then
      update public.live_participants
      set status='ended_insufficient_funds',left_at=now()
      where session_id=p.session_id and participant_id=p.participant_id;
      insert into public.live_enforcement_actions(session_id,participant_id,action)
      values(p.session_id,p.participant_id,'remove_participant');
    end;
  end loop;
  return charged;
end
$function$;

grant execute on function public.charge_active_live_minutes() to service_role;
