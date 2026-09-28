-- Phase 6 hardening: AAL2 is mandatory for every finance/admin financial action

create or replace function public.finance_require_aal2()
returns void
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if coalesce((auth.jwt()->>'aal'),'aal1') <> 'aal2' then
    raise exception 'aal2_required';
  end if;
end
$$;

create or replace function public.assert_spend_limit(_uid uuid,_amount bigint)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  l public.spend_limits;
  day_start timestamptz := (date_trunc('day',now() at time zone 'Africa/Maputo') at time zone 'Africa/Maputo');
  week_start timestamptz := (date_trunc('week',now() at time zone 'Africa/Maputo') at time zone 'Africa/Maputo');
  month_start timestamptz := (date_trunc('month',now() at time zone 'Africa/Maputo') at time zone 'Africa/Maputo');
  d bigint;
  w bigint;
  m bigint;
begin
  if _amount<=0 then raise exception 'invalid_amount'; end if;
  select * into l from public.spend_limits where user_id=_uid;
  if not found then return; end if;

  select
    coalesce(sum(-amount) filter(where created_at>=day_start),0),
    coalesce(sum(-amount) filter(where created_at>=week_start),0),
    coalesce(sum(-amount) filter(where created_at>=month_start),0)
  into d,w,m
  from public.ledger_entries
  where owner_id=_uid and account='wallet' and amount<0 and kind not in('escrow_hold','payout_hold');

  if l.daily is not null and d+_amount>l.daily then raise exception 'daily_spend_limit'; end if;
  if l.weekly is not null and w+_amount>l.weekly then raise exception 'weekly_spend_limit'; end if;
  if l.monthly is not null and m+_amount>l.monthly then raise exception 'monthly_spend_limit'; end if;
end
$$;

create or replace function public.set_spend_limits(_daily bigint,_weekly bigint,_monthly bigint)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if _daily is not null and _daily<0 then raise exception 'invalid_daily_limit'; end if;
  if _weekly is not null and _weekly<0 then raise exception 'invalid_weekly_limit'; end if;
  if _monthly is not null and _monthly<0 then raise exception 'invalid_monthly_limit'; end if;
  if _daily is not null and _weekly is not null and _daily>_weekly then raise exception 'daily_over_weekly'; end if;
  if _weekly is not null and _monthly is not null and _weekly>_monthly then raise exception 'weekly_over_monthly'; end if;

  insert into public.spend_limits(user_id,daily,weekly,monthly)
  values(auth.uid(),_daily,_weekly,_monthly)
  on conflict(user_id) do update
  set daily=excluded.daily,weekly=excluded.weekly,monthly=excluded.monthly,updated_at=now();
end
$$;
