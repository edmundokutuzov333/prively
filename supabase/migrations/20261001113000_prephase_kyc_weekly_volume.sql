create or replace function public.kyc_manual_queue_weekly_volume()
returns table(week_start date, count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select date_trunc('week', created_at)::date as week_start,
         count(*)::bigint as count
  from public.kyc_verifications
  where provider = 'manual'
  group by 1
  order by 1 desc
  limit 8
$function$;

revoke all on function public.kyc_manual_queue_weekly_volume() from public, anon, authenticated;
grant execute on function public.kyc_manual_queue_weekly_volume() to authenticated;

create or replace function public.kyc_manual_queue_weekly_volume_guarded()
returns table(week_start date, count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select *
  from public.kyc_manual_queue_weekly_volume()
  where public.has_permission(auth.uid(),'admin.kyc')
$function$;

revoke all on function public.kyc_manual_queue_weekly_volume_guarded() from public, anon, authenticated;
grant execute on function public.kyc_manual_queue_weekly_volume_guarded() to authenticated;
