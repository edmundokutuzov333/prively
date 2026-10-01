create or replace function public.get_my_kyc_status()
returns table(
  status text,
  reason text,
  provider text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select k.status, k.reason, k.provider, k.created_at, k.reviewed_at
  from public.kyc_verifications k
  where k.user_id = auth.uid()
  order by k.created_at desc
  limit 1
$function$;

revoke all on function public.get_my_kyc_status() from public, anon, authenticated;
grant execute on function public.get_my_kyc_status() to authenticated;
