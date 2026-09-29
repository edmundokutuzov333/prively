-- Phase 8 hardening and operational read contracts.

create or replace function public.phase8_safety_staff(_uid uuid)
returns boolean
language sql stable security definer set search_path=public
as $phase8$
  select public.has_role(_uid,'support'::app_role)
      or public.has_role(_uid,'moderator'::app_role)
      or public.has_role(_uid,'compliance'::app_role)
      or public.has_role(_uid,'admin'::app_role);
$phase8$;

create or replace function public.get_safety_incidents(_limit integer default 100)
returns table(
  panic_id uuid,
  panic_user_id uuid,
  panic_created_at timestamptz,
  panic_share_location boolean,
  panic_alert_status text,
  checkin_id uuid,
  checkin_user_id uuid,
  checkin_expected_end timestamptz,
  checkin_status text,
  checkin_alerted_at timestamptz
)
language plpgsql security definer set search_path=public
as $phase8$
begin
  if not public.phase8_safety_staff(auth.uid()) then raise exception 'forbidden'; end if;
  return query
  with p as (
    select pe.id,pe.user_id,pe.created_at,pe.share_location,pe.alert_status,
           row_number() over(order by pe.created_at desc) rn
    from public.panic_events pe
    where pe.resolved_at is null
    order by pe.created_at desc
    limit greatest(1,least(coalesce(_limit,100),500))
  ),
  c as (
    select sc.id,sc.user_id,sc.expected_end,sc.status,sc.alerted_at,
           row_number() over(order by coalesce(sc.alerted_at,sc.expected_end) desc) rn
    from public.safety_checkins sc
    where sc.status='alerted'
    order by coalesce(sc.alerted_at,sc.expected_end) desc
    limit greatest(1,least(coalesce(_limit,100),500))
  )
  select p.id,p.user_id,p.created_at,p.share_location,p.alert_status,
         c.id,c.user_id,c.expected_end,c.status,c.alerted_at
  from p
  full join c on p.rn=c.rn
  order by coalesce(p.created_at,c.alerted_at,c.expected_end) desc;
end;
$phase8$;

create or replace function public.resolve_panic_event(_panic_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $phase8$
begin
  if not public.phase8_safety_staff(auth.uid()) then raise exception 'forbidden'; end if;
  update public.panic_events set resolved_at=now()
  where id=_panic_id and resolved_at is null;
  if not found then raise exception 'panic_not_found'; end if;
  perform public.phase8_audit('panic_event_resolved','panic_event',_panic_id,null,'{}'::jsonb);
  return true;
end;
$phase8$;

grant insert on public.dmca_requests to anon,authenticated;
grant select on public.dmca_requests to authenticated;
grant execute on function public.get_safety_incidents(integer) to authenticated;
grant execute on function public.resolve_panic_event(uuid) to authenticated;

drop policy if exists dmca_public_insert on public.dmca_requests;
create policy dmca_public_insert on public.dmca_requests for insert to anon,authenticated
with check (char_length(trim(claimant_name)) between 2 and 160
  and claimant_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  and char_length(trim(copyrighted_work)) between 2 and 500
  and char_length(trim(target_url)) between 5 and 2000
  and char_length(trim(statement)) between 20 and 5000
  and char_length(trim(signature_name)) between 2 and 160);

-- Do not expose raw staff incident storage to clients.
revoke all on function public.phase8_safety_staff(uuid) from public,anon,authenticated;
grant execute on function public.phase8_safety_staff(uuid) to authenticated;

insert into public.platform_settings(key,value)
values ('feature_flags.dmca','true'::jsonb)
on conflict(key) do update set value=excluded.value,updated_at=now();
