create or replace function public.approve_kyc(_kyc uuid,_approved boolean,_reason text default null)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  k public.kyc_verifications;
begin
  if not (public.has_permission(auth.uid(),'admin.kyc') or public.has_permission(auth.uid(),'admin.compliance')) then
    raise exception using
      errcode='42501',
      message='forbidden';
  end if;

  select * into k
  from public.kyc_verifications
  where id=_kyc
  for update;

  if not found then
    raise exception 'kyc_not_found';
  end if;

  perform set_config('app.internal_write','on',true);

  update public.kyc_verifications
  set status=case when _approved then 'approved' else 'rejected' end,
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      reason=nullif(trim(_reason),'')
  where id=k.id;

  update public.profiles
  set status=case when _approved then 'active' else 'pending' end,
      age_verified_at=case when _approved then now() else age_verified_at end
  where public.profiles.id=k.user_id;

  if _approved then
    insert into public.user_roles(user_id,role)
    values(k.user_id,'creator')
    on conflict do nothing;
  end if;
end
$$;

grant execute on function public.approve_kyc(uuid,boolean,text) to authenticated;
