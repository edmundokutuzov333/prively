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
  returning public.legal_acceptances.id into id;

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
  acceptance_id uuid;
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
  returning public.creator_terms_acceptances.id into acceptance_id;

  if acceptance_id is null then
    select cta.id into acceptance_id
    from public.creator_terms_acceptances cta
    where cta.user_id=auth.uid()
      and cta.version=trim(_version);
  end if;

  perform public.record_legal_acceptance(
    'creator_terms',
    trim(_version),
    coalesce(nullif(trim(_source),''),'web'),
    jsonb_build_object(
      'creator_terms_acceptance_id', acceptance_id,
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
      'creator_terms_acceptance_id', acceptance_id
    )
  );

  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(
    auth.uid(),auth.uid(),'creator.terms.accepted',
    jsonb_build_object('version',trim(_version),'acceptance_id',acceptance_id)
  );

  return acceptance_id;
end
$function$;
