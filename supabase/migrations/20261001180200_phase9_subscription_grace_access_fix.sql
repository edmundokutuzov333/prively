-- Phase 9 grace-period access hardening.
-- A failed renewal keeps subscription access for the documented three-day grace window.

create or replace function public.has_active_subscription(_uid uuid, _channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
select case
  when auth.uid() is not null and _uid <> auth.uid() then false
  else exists(
    select 1
    from public.subscriptions
    where subscriber_id = _uid
      and channel_id = _channel
      and (
        (status = 'active' and current_period_end > now())
        or (
          status = 'past_due'
          and past_due_at is not null
          and past_due_at >= now() - interval '3 days'
        )
      )
  )
end
$function$;

revoke all on function public.has_active_subscription(uuid,uuid)
from public, anon, authenticated;
grant execute on function public.has_active_subscription(uuid,uuid)
to service_role;
