-- Phase 6 UI contracts: expose non-sensitive finance settings through a guarded RPC

insert into public.platform_settings(key,value,updated_at)
values
  ('payment.methods','{"mpesa":true,"emola":true,"mkesh":true,"ponto24":true,"card":false}'::jsonb,now())
on conflict(key) do nothing;

create or replace function public.get_financial_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  methods jsonb;
  min_payout bigint;
  hold_hours integer;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;

  select value into methods from public.platform_settings where key='payment.methods';
  select coalesce((value#>>'{}')::bigint,50000) into min_payout
  from public.platform_settings where key='payout.min_centavos';
  select coalesce((value#>>'{}')::integer,72) into hold_hours
  from public.platform_settings where key='hold_hours';

  return jsonb_build_object(
    'payout_min_centavos',min_payout,
    'hold_hours',hold_hours,
    'payment_methods',coalesce(methods,'{"mpesa":true,"emola":true,"mkesh":true,"ponto24":true,"card":false}'::jsonb)
  );
end
$$;

create or replace function public.get_spend_limits()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
select jsonb_build_object(
  'daily',(select daily from public.spend_limits where user_id=auth.uid()),
  'weekly',(select weekly from public.spend_limits where user_id=auth.uid()),
  'monthly',(select monthly from public.spend_limits where user_id=auth.uid())
)
$$;

grant execute on function public.get_financial_settings() to authenticated;
grant execute on function public.get_spend_limits() to authenticated;
