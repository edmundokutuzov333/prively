-- Fase 2: remove the email-confirmation bypass and make signup metadata
-- descriptive only. Authorization continues to come from server-side tables.
drop trigger if exists prively_autoconfirm_email on auth.users;
drop function if exists public.prively_autoconfirm_email();

alter table public.legal_acceptances add column if not exists content_hash text;
alter table public.creator_terms_acceptances add column if not exists content_hash text;

alter table public.profiles drop constraint if exists profiles_handle_check;
alter table public.profiles drop constraint if exists profiles_handle_format;
alter table public.profiles add constraint profiles_handle_format
  check (handle ~ '^[a-z0-9_.]{3,24}$'::citext);

create table if not exists public.reserved_handles(
  handle citext primary key,
  reason text not null default 'system'
);
alter table public.reserved_handles enable row level security;
revoke all on public.reserved_handles from anon, authenticated;
insert into public.reserved_handles(handle) values
  ('admin'),('prively'),('suporte'),('support'),('moderacao'),('moderation'),
  ('finance'),('compliance'),('safety'),('help'),('root'),('system')
on conflict do nothing;

create unique index if not exists profiles_handle_lower_unique
  on public.profiles (lower(handle::text));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  h text := lower(trim(coalesce(new.raw_user_meta_data->>'handle','')));
  requested_role text := lower(coalesce(new.raw_user_meta_data->>'signup_role', new.raw_user_meta_data->>'role', 'client'));
  role_to_grant public.app_role := case when requested_role = 'creator' then 'creator'::public.app_role else 'client'::public.app_role end;
  suffix integer := 0;
  legal jsonb := coalesce(new.raw_user_meta_data->'legal_acceptances','{}'::jsonb);
  creator_version text;
  declaration_data jsonb;
begin
  if h !~ '^[a-z0-9_.]{3,24}$' or exists(select 1 from public.reserved_handles r where r.handle=h) then
    h := 'priv_' || replace(left(new.id::text,18),'-','');
  end if;
  while exists(select 1 from public.profiles p where lower(p.handle::text)=lower(h)) loop
    suffix := suffix + 1;
    h := left('priv_' || replace(left(new.id::text,14),'-','') || suffix::text,24);
  end loop;

  insert into public.profiles(id,handle,display_name)
  values(new.id,h,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),h))
  on conflict(id) do nothing;
  insert into public.user_roles(user_id,role) values(new.id,'client') on conflict do nothing;
  if role_to_grant='creator' then
    insert into public.user_roles(user_id,role) values(new.id,'creator') on conflict do nothing;
  end if;
  insert into public.balances(owner_id,account,balance) values
    (new.id,'wallet',0),(new.id,'creator_pending',0),(new.id,'creator_available',0)
  on conflict(owner_id,account) do nothing;

  -- Registration consent is written by the trusted trigger, not by an
  -- unconfirmed browser session. Metadata never grants authorization.
  if jsonb_typeof(legal->'terms')='object' then
    insert into public.legal_acceptances(user_id,document_type,version,source,content_hash,metadata)
    values(new.id,'terms',coalesce(legal->'terms'->>'version','1.0'),'registration',legal->'terms'->>'content_hash',jsonb_build_object('email_confirmed_required',true));
  end if;
  if jsonb_typeof(legal->'privacy')='object' then
    insert into public.legal_acceptances(user_id,document_type,version,source,content_hash,metadata)
    values(new.id,'privacy',coalesce(legal->'privacy'->>'version','1.0'),'registration',legal->'privacy'->>'content_hash',jsonb_build_object('email_confirmed_required',true));
  end if;
  if role_to_grant='creator' and jsonb_typeof(legal->'creator_terms')='object' then
    creator_version := coalesce(legal->'creator_terms'->>'version',(select value#>>'{}' from public.platform_settings where key='legal.creator_terms_version'));
    declaration_data := coalesce(legal->'creator_terms'->'declarations','{}'::jsonb);
    insert into public.creator_terms_acceptances(user_id,version,source,declarations,content_hash,metadata)
    values(new.id,creator_version,'registration',declaration_data,legal->'creator_terms'->>'content_hash',jsonb_build_object('email_confirmed_required',true))
    on conflict(user_id,version) do nothing;
  end if;
  return new;
end
$function$;

create unique index if not exists kyc_provider_ref_unique
  on public.kyc_verifications(provider,provider_ref)
  where provider_ref is not null;

create or replace function public.apply_kyc_result(
  _user_id uuid,
  _provider text,
  _provider_ref text,
  _status text,
  _min_age_verified boolean,
  _reason text default null,
  _document_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
declare verification_id uuid; current_status text; approved boolean;
begin
  if current_setting('request.jwt.claim.role',true) <> 'service_role' then raise exception 'service_role_required'; end if;
  if _status not in ('approved','rejected','needs_review') then raise exception 'invalid_kyc_status'; end if;
  if _provider_ref is null or nullif(trim(_provider_ref),'') is null then raise exception 'provider_ref_required'; end if;
  select id into verification_id from public.kyc_verifications where provider=_provider and provider_ref=_provider_ref;
  if verification_id is not null then return verification_id; end if;
  approved := _status='approved' and _min_age_verified and (_document_expires_at is null or _document_expires_at>now());
  if _status='approved' and not approved then raise exception 'kyc_approval_requirements_not_met'; end if;
  select id,status into verification_id,current_status from public.kyc_verifications where user_id=_user_id order by created_at desc limit 1 for update;
  if verification_id is null then
    insert into public.kyc_verifications(user_id,provider,provider_ref,status,reason,reviewed_at)
    values(_user_id,_provider,_provider_ref,case when approved then 'approved' else case when _status='rejected' then 'rejected' else 'pending' end end,nullif(trim(_reason),''),now()) returning id into verification_id;
  else
    update public.kyc_verifications set provider=_provider,provider_ref=_provider_ref,status=case when approved then 'approved' else case when _status='rejected' then 'rejected' else 'pending' end end,reason=nullif(trim(_reason),''),reviewed_at=now() where id=verification_id;
  end if;
  if approved then
    perform set_config('app.internal_write','on',true);
    update public.profiles set age_verified_at=now(),status='active' where id=_user_id;
  end if;
  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(_user_id,null,'kyc.result.applied',jsonb_build_object('provider',_provider,'provider_ref',_provider_ref,'status',case when approved then 'approved' else _status end,'min_age_verified',_min_age_verified));
  return verification_id;
end
$function$;

revoke all on function public.apply_kyc_result(uuid,text,text,text,boolean,text,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_kyc_result(uuid,text,text,text,boolean,text,timestamptz) to service_role;
