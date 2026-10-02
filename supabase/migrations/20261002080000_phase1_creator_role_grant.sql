-- Phase 1 follow-up: creator role grant contract.
-- Forward-only. The caller-facing Edge Function remains responsible for
-- authenticating the user and checking the current KYC state. This RPC is
-- service-role only so role assignment and audit insertion stay atomic.

create or replace function public.grant_creator_role(_uid uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  created boolean := false;
begin
  if _uid is null or not exists (
    select 1 from auth.users where id = _uid
  ) then
    raise exception 'user_not_found';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = _uid
      and p.status = 'active'
      and p.age_verified_at is not null
      and (p.self_excluded_until is null or p.self_excluded_until <= now())
  ) then
    raise exception 'age_not_verified';
  end if;

  if not exists (
    select 1
    from public.kyc_verifications k
    where k.user_id = _uid
      and k.status = 'approved'
  ) then
    raise exception 'kyc_required';
  end if;

  insert into public.user_roles(user_id, role)
  values (_uid, 'creator'::public.app_role)
  on conflict (user_id, role) do nothing;

  if found then
    created := true;
    insert into public.audit_log(
      actor_id,
      event_type,
      target_type,
      target_id,
      reason,
      metadata
    )
    values (
      _uid,
      'creator_role_granted',
      'user_roles',
      _uid,
      'creator_onboarding',
      jsonb_build_object('role', 'creator')
    );
  end if;

  return created;
end
$function$;

revoke all on function public.grant_creator_role(uuid) from public, anon, authenticated;
grant execute on function public.grant_creator_role(uuid) to service_role;
