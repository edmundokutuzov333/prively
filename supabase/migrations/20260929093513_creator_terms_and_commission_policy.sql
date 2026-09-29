-- Creator Terms and Conditions v1.0.0 for Mozambique creators.
-- Server-enforced acceptance, immutable audit record, and fee alignment.

insert into public.platform_settings(key, value, updated_by, updated_at)
values
  ('legal.creator_terms_version', '"1.0.0"'::jsonb, null, now()),
  ('commission.default', '0.20'::jsonb, null, now()),
  ('commission.by_kind', '{"tip":0.10}'::jsonb, null, now())
on conflict (key) do update
set value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = now();

create table if not exists public.creator_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  source text not null default 'web',
  declarations jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(user_id, version),
  constraint creator_terms_version_not_blank check (char_length(trim(version)) > 0),
  constraint creator_terms_declarations_object check (jsonb_typeof(declarations) = 'object')
);

alter table public.creator_terms_acceptances enable row level security;

drop policy if exists creator_terms_acceptances_own_read on public.creator_terms_acceptances;
create policy creator_terms_acceptances_own_read
  on public.creator_terms_acceptances
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists creator_terms_acceptances_admin_read on public.creator_terms_acceptances;
create policy creator_terms_acceptances_admin_read
  on public.creator_terms_acceptances
  for select
  to authenticated
  using (has_permission((select auth.uid()), 'admin.audit'));

drop policy if exists creator_terms_acceptances_admin_manage on public.creator_terms_acceptances;
create policy creator_terms_acceptances_admin_manage
  on public.creator_terms_acceptances
  for all
  to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

revoke insert, update, delete on public.creator_terms_acceptances from anon, authenticated;

create or replace function public.record_legal_acceptance(
  _document_type text,
  _version text,
  _source text default 'web',
  _metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if _document_type not in ('terms','creator_terms','privacy','content_prohibited','refunds','cookies','dmca') then
    raise exception 'invalid_document_type';
  end if;
  if nullif(trim(_version),'') is null then raise exception 'document_version_required'; end if;

  insert into public.legal_acceptances(user_id,document_type,version,source,metadata)
  values(auth.uid(),trim(_document_type),trim(_version),coalesce(nullif(trim(_source),''),'web'),coalesce(_metadata,'{}'::jsonb))
  on conflict(user_id,document_type,version) do nothing
  returning id into id;

  if id is null then
    select la.id into id
    from public.legal_acceptances la
    where la.user_id=auth.uid()
      and la.document_type=_document_type
      and la.version=_version;
  end if;

  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(auth.uid(),auth.uid(),'legal.accepted',jsonb_build_object('document',_document_type,'version',_version));

  return id;
end
$function$;

create or replace function public.accept_creator_terms(
  _version text,
  _declarations jsonb,
  _source text default 'web',
  _metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  id uuid;
  current_version text;
  required_keys constant text[] := array[
    'age_18',
    'accept_terms',
    'commission_rates',
    'identity_verification',
    'all_involved_adults_consent',
    'encounters_not_prively',
    'prohibited_content',
    'content_rights',
    'privacy_sensitive_data',
    'pending_balance_retention',
    'no_illegal_use',
    'no_income_guarantee',
    'essential_communications',
    'truthful_information',
    'suspension_termination',
    'mozambique_law_maputo_forum'
  ];
  missing_keys text[];
  normalized jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists (
    select 1 from public.user_roles
    where user_id=auth.uid() and role='creator'
  ) then
    raise exception 'creator_role_required';
  end if;

  select value #>> '{}' into current_version
  from public.platform_settings
  where key='legal.creator_terms_version';

  if current_version is null or trim(_version) <> trim(current_version) then
    raise exception 'creator_terms_version_mismatch';
  end if;

  if _declarations is null or jsonb_typeof(_declarations) <> 'object' then
    raise exception 'creator_terms_declarations_required';
  end if;

  select array_agg(k)
  into missing_keys
  from unnest(required_keys) as k
  where coalesce((_declarations ->> k) = 'true', false) is not true;

  if coalesce(array_length(missing_keys,1),0) > 0 then
    raise exception 'creator_terms_declarations_incomplete:%', array_to_string(missing_keys, ',');
  end if;

  select jsonb_object_agg(k, true)
  into normalized
  from unnest(required_keys) as k;

  insert into public.creator_terms_acceptances(
    user_id, version, source, declarations, metadata
  )
  values(
    auth.uid(),
    trim(_version),
    coalesce(nullif(trim(_source),''),'web'),
    normalized,
    coalesce(_metadata,'{}'::jsonb)
  )
  on conflict(user_id, version) do nothing
  returning id into id;

  if id is null then
    select cta.id into id
    from public.creator_terms_acceptances cta
    where cta.user_id=auth.uid()
      and cta.version=trim(_version);
  end if;

  perform public.record_legal_acceptance(
    'creator_terms',
    trim(_version),
    coalesce(nullif(trim(_source),''),'web'),
    jsonb_build_object(
      'creator_terms_acceptance_id', id,
      'declaration_count', 16,
      'metadata', coalesce(_metadata,'{}'::jsonb)
    )
  );

  perform public.record_legal_acceptance(
    'privacy',
    '1.0',
    coalesce(nullif(trim(_source),''),'web'),
    jsonb_build_object(
      'source_document', 'creator_terms',
      'creator_terms_version', trim(_version),
      'creator_terms_acceptance_id', id
    )
  );

  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(
    auth.uid(),auth.uid(),'creator.terms.accepted',
    jsonb_build_object('version',trim(_version),'acceptance_id',id)
  );

  return id;
end
$function$;

create or replace function public.get_creator_terms_status()
returns table(current_version text, accepted boolean, accepted_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then
    return query select null::text, false, null::timestamptz;
    return;
  end if;

  current_version := (
    select value #>> '{}'
    from public.platform_settings
    where key='legal.creator_terms_version'
  );

  select true, cta.accepted_at
  into accepted, accepted_at
  from public.creator_terms_acceptances cta
  where cta.user_id=auth.uid()
    and cta.version=current_version
  order by cta.accepted_at desc
  limit 1;

  accepted := coalesce(accepted,false);
  return next;
end
$function$;

revoke execute on function public.accept_creator_terms(text,jsonb,text,jsonb) from public, anon;
grant execute on function public.accept_creator_terms(text,jsonb,text,jsonb) to authenticated;

revoke execute on function public.get_creator_terms_status() from public, anon;
grant execute on function public.get_creator_terms_status() to authenticated;

grant select on public.creator_terms_acceptances to authenticated;
