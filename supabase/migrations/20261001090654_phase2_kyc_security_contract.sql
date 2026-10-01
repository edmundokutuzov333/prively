revoke all on function public.submit_kyc(text,text,text) from public, anon, authenticated;
drop function if exists public.submit_kyc(text,text,text);

revoke all on function public.kyc_manual_queue_weekly_volume() from public, anon, authenticated;
grant execute on function public.kyc_manual_queue_weekly_volume() to service_role;

revoke all on function public.kyc_manual_queue_weekly_volume_guarded() from public, anon, authenticated;
grant execute on function public.kyc_manual_queue_weekly_volume_guarded() to authenticated;
