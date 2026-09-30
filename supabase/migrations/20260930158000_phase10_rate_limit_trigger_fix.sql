-- Phase 10: fix rate-limit trigger row-field dispatch.
-- PostgreSQL resolves record field references even inside CASE branches,
-- so NEW.reporter_id fails for tables whose rows do not have that column.

create or replace function public.phase10_rate_limit_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $function$
declare
  actor uuid;
  scope_name text;
  scope_limit integer;
  scope_window integer;
begin
  if TG_TABLE_NAME='reports' then
    actor := NEW.reporter_id;
    scope_name := 'report';
    scope_limit := 10;
    scope_window := 3600;
  elsif TG_TABLE_NAME='topups' then
    actor := NEW.user_id;
    scope_name := 'topup';
    scope_limit := 6;
    scope_window := 3600;
  elsif TG_TABLE_NAME='payouts' then
    actor := NEW.owner_id;
    scope_name := 'payout';
    scope_limit := 3;
    scope_window := 86400;
  elsif TG_TABLE_NAME='messages' then
    actor := NEW.sender_id;
    scope_name := 'message';
    scope_limit := 60;
    scope_window := 60;
  else
    return NEW;
  end if;

  if actor is null then
    return NEW;
  end if;

  perform public.phase10_assert_rate_limit(
    scope_name,
    actor::text,
    scope_limit,
    scope_window
  );

  return NEW;
end
$function$;

revoke all on function public.phase10_rate_limit_trigger() from public,anon,authenticated;
