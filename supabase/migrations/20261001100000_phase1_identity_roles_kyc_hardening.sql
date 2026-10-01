create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.user_roles (
  user_id uuid not null references auth.users on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;

drop policy if exists "roles_own_read" on public.user_roles;
create policy "roles_own_read"
on public.user_roles
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "admin_manage_all" on public.user_roles;
create policy "admin_manage_all"
on public.user_roles
for all
to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create or replace function public.has_role(_uid uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select case
    when auth.uid() is not null and _uid <> auth.uid() then false
    else exists (
      select 1
      from public.user_roles
      where user_id = _uid
        and role = _role
    )
  end
$function$;

revoke all on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.role() = 'service_role'
     or public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'compliance') then
    return new;
  end if;

  new.age_verified_at := old.age_verified_at;
  new.status := old.status;
  new.self_excluded_until := old.self_excluded_until;
  return new;
end
$function$;

drop trigger if exists trg_profiles_protected_fields on public.profiles;
create trigger trg_profiles_protected_fields
before update on public.profiles
for each row
execute function public.protect_profile_security_fields();

alter table public.kyc_verifications add column if not exists doc_type text;

create index if not exists idx_kyc_verifications_user_created
on public.kyc_verifications(user_id, created_at desc);

alter table public.kyc_verifications enable row level security;

drop policy if exists "kyc_no_direct_read" on public.kyc_verifications;
drop policy if exists "user reads own kyc status" on public.kyc_verifications;
create policy "user reads own kyc status"
on public.kyc_verifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user creates own kyc request" on public.kyc_verifications;
create policy "user creates own kyc request"
on public.kyc_verifications
for insert
to authenticated
with check (auth.uid() = user_id and status = 'pending');

create or replace function public.is_age_verified(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select case
    when auth.uid() is not null and _uid <> auth.uid() then false
    else exists (
      select 1
      from public.profiles p
      where p.id = _uid
        and p.age_verified_at is not null
        and p.status = 'active'
        and (p.self_excluded_until is null or p.self_excluded_until <= now())
        and exists (
          select 1
          from public.kyc_verifications k
          where k.user_id = _uid
            and k.status = 'approved'
        )
    )
  end
$function$;

revoke all on function public.is_age_verified(uuid) from public, anon, authenticated;
grant execute on function public.is_age_verified(uuid) to authenticated;

create or replace function public.submit_kyc(
  _doc_path text,
  _selfie_path text,
  _provider text default 'manual',
  _doc_type text default 'identity_document'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id uuid := gen_random_uuid();
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'unauthorized';
  end if;

  if coalesce(nullif(trim(_provider), ''), 'manual') <> 'manual' then
    raise exception 'kyc_provider_unverified';
  end if;

  if nullif(trim(_doc_path), '') is null or nullif(trim(_selfie_path), '') is null then
    raise exception 'kyc_documents_required';
  end if;

  if split_part(trim(_doc_path), '/', 1) <> v_user::text
     or split_part(trim(_selfie_path), '/', 1) <> v_user::text then
    raise exception 'kyc_path_forbidden';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'prively-kyc'
      and name = trim(_doc_path)
      and owner_id = v_user::text
  ) then
    raise exception 'kyc_document_not_uploaded';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'prively-kyc'
      and name = trim(_selfie_path)
      and owner_id = v_user::text
  ) then
    raise exception 'kyc_selfie_not_uploaded';
  end if;

  if exists (
    select 1
    from public.kyc_verifications
    where user_id = v_user
      and status in ('pending','review')
  ) then
    raise exception 'kyc_already_pending';
  end if;

  insert into public.kyc_verifications(
    id,user_id,provider,status,doc_type,doc_path,selfie_path
  )
  values(
    v_id,v_user,'manual','pending',
    coalesce(nullif(trim(_doc_type),''),'identity_document'),
    trim(_doc_path),trim(_selfie_path)
  );

  insert into public.security_events(
    user_id,actor_id,event_type,metadata
  )
  values(
    v_user,v_user,'kyc.submitted',
    jsonb_build_object('kyc_id',v_id,'provider','manual')
  );

  return v_id;
end
$function$;

revoke all on function public.submit_kyc(text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_kyc(text,text,text,text) to authenticated;

drop function if exists public.approve_kyc(uuid,boolean,text);

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

  if _reviewer is null
     or not (
       public.has_role(_reviewer,'admin')
       or public.has_role(_reviewer,'compliance')
     ) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  select *
  into k
  from public.kyc_verifications
  where id = _kyc
  for update;

  if not found then
    raise exception 'kyc_not_found';
  end if;

  update public.kyc_verifications
  set status = case when _approved then 'approved' else 'rejected' end,
      reviewed_by = _reviewer,
      reviewed_at = now(),
      reason = nullif(trim(_reason),'')
  where id = k.id;

  if _approved then
    update public.profiles
    set age_verified_at = now(),
        status = 'active'
    where id = k.user_id;
  end if;

  insert into public.audit_log(
    actor_id,event_type,target_type,target_id,reason,metadata
  )
  values(
    _reviewer,
    case when _approved then 'kyc_approved' else 'kyc_rejected' end,
    'kyc_verification',
    k.id,
    nullif(trim(_reason),''),
    jsonb_build_object(
      'user_id',k.user_id,
      'provider',k.provider
    )
  );
end
$function$;

revoke all on function public.approve_kyc(uuid,boolean,text,uuid) from public, anon, authenticated;
grant execute on function public.approve_kyc(uuid,boolean,text,uuid) to service_role;

update storage.buckets
set public = false
where id = 'prively-kyc';

drop policy if exists "prively_kyc_owner_insert" on storage.objects;
create policy "prively_kyc_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'prively-kyc'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "prively_kyc_admin_read" on storage.objects;
create policy "prively_kyc_admin_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'prively-kyc'
  and public.has_role(auth.uid(),'admin')
);

drop policy if exists "prively_kyc_compliance_read" on storage.objects;
create policy "prively_kyc_compliance_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'prively-kyc'
  and public.has_role(auth.uid(),'compliance')
);
