alter table public.payment_webhook_events drop constraint if exists payment_webhook_events_status_check;
alter table public.payment_webhook_events add constraint payment_webhook_events_status_check check(status in ('received','processed','ignored','failed','quarantined'));

create table if not exists public.financial_alerts(
  id bigint generated always as identity primary key,
  kind text not null,
  severity text not null check(severity in ('low','medium','high')),
  message text not null,
  metadata jsonb not null default '{}',
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.financial_alerts enable row level security;
revoke all on public.financial_alerts from anon,authenticated;
create policy financial_alerts_finance_read on public.financial_alerts for select to authenticated using(public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'admin'));

insert into public.platform_settings(key,value) values
  ('wallet.production_enabled','false'::jsonb),
  ('wallet.max_balance_minor','5000000'::jsonb),
  ('wallet.daily_topup_limit_minor','1000000'::jsonb),
  ('wallet.min_topup_minor','10000'::jsonb),
  ('wallet.max_topup_minor','500000'::jsonb)
on conflict(key) do nothing;

create or replace function public.guard_wallet_production()
returns trigger language plpgsql security definer set search_path=public as $function$
declare enabled boolean;
begin
  select coalesce((value#>>'{}')::boolean,false) into enabled from public.platform_settings where key='wallet.production_enabled';
  if not enabled then raise exception 'wallet_production_disabled'; end if;
  if new.amount > coalesce((select (value#>>'{}')::bigint from public.platform_settings where key='wallet.max_topup_minor'),500000) then raise exception 'topup_limit_exceeded'; end if;
  return new;
end
$function$;
drop trigger if exists trg_wallet_production_guard on public.topups;
create trigger trg_wallet_production_guard before insert on public.topups for each row execute function public.guard_wallet_production();

do $$ begin
  if to_regnamespace('vault') is not null and not exists(select 1 from vault.secrets where name='prively_payments_reconcile_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'prively_payments_reconcile_token');
  end if;
end $$;
