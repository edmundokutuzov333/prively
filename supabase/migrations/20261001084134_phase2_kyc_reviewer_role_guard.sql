create or replace function public.approve_kyc(
  _kyc uuid,
  _approved boolean,
  _reason text default null,
  _reviewer uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  k public.kyc_verifications;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if _reviewer is null or not exists (
    select 1 from public.user_roles ur
    where ur.user_id = _reviewer and ur.role in ('admin','compliance')
  ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into k from public.kyc_verifications where id = _kyc for update;
  if not found then raise exception 'kyc_not_found'; end if;
  update public.kyc_verifications
  set status = case when _approved then 'approved' else 'rejected' end,
      reviewed_by = _reviewer,
      reviewed_at = now(),
      reason = nullif(trim(_reason),'')
  where id = k.id;
  if _approved then
    update public.profiles
    set age_verified_at = now(), status = 'active'
    where id = k.user_id;
  end if;
  insert into public.audit_log(actor_id,event_type,target_type,target_id,reason,metadata)
  values(
    _reviewer,
    case when _approved then 'kyc_approved' else 'kyc_rejected' end,
    'kyc_verification',
    k.id,
    nullif(trim(_reason),''),
    jsonb_build_object('user_id',k.user_id,'provider',k.provider)
  );
end
$function$;
revoke all on function public.approve_kyc(uuid,boolean,text,uuid) from public, anon, authenticated;
grant execute on function public.approve_kyc(uuid,boolean,text,uuid) to service_role;
