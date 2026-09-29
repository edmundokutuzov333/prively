create or replace function public.has_current_creator_terms(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.creator_terms_acceptances cta
    join public.platform_settings ps
      on ps.key = 'legal.creator_terms_version'
     and cta.version = ps.value #>> '{}'
    where cta.user_id = _uid
  )
$function$;

create or replace function public.is_creator_of_channel(_uid uuid, _channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
select case
  when auth.uid() is not null and _uid<>auth.uid() then false
  else exists(
    select 1
    from public.channels c
    join public.user_roles r on r.user_id=c.owner_id and r.role='creator'
    where c.id=_channel
      and c.owner_id=_uid
      and public.has_current_creator_terms(_uid)
  )
end
$function$;

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
declare id uuid;
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
    where la.user_id=auth.uid() and la.document_type=_document_type and la.version=_version;
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
    'age_18','accept_terms','commission_rates','identity_verification',
    'all_involved_adults_consent','encounters_not_prively','prohibited_content',
    'content_rights','privacy_sensitive_data','pending_balance_retention',
    'no_illegal_use','no_income_guarantee','essential_communications',
    'truthful_information','suspension_termination','mozambique_law_maputo_forum'
  ];
  missing_keys text[];
  normalized jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from public.user_roles where user_id=auth.uid() and role='creator') then
    raise exception 'creator_role_required';
  end if;

  select value #>> '{}' into current_version from public.platform_settings where key='legal.creator_terms_version';
  if current_version is null or trim(_version) <> trim(current_version) then raise exception 'creator_terms_version_mismatch'; end if;
  if _declarations is null or jsonb_typeof(_declarations) <> 'object' then raise exception 'creator_terms_declarations_required'; end if;

  select array_agg(k) into missing_keys
  from unnest(required_keys) as k
  where coalesce((_declarations ->> k) = 'true', false) is not true;

  if coalesce(array_length(missing_keys,1),0) > 0 then
    raise exception 'creator_terms_declarations_incomplete:%', array_to_string(missing_keys, ',');
  end if;

  select jsonb_object_agg(k, true) into normalized from unnest(required_keys) as k;

  insert into public.creator_terms_acceptances(user_id,version,source,declarations,metadata)
  values(auth.uid(),trim(_version),coalesce(nullif(trim(_source),''),'web'),normalized,coalesce(_metadata,'{}'::jsonb))
  on conflict(user_id,version) do nothing
  returning public.creator_terms_acceptances.id into acceptance_id;

  if acceptance_id is null then
    select cta.id into acceptance_id
    from public.creator_terms_acceptances cta
    where cta.user_id=auth.uid() and cta.version=trim(_version);
  end if;

  perform public.record_legal_acceptance(
    'creator_terms',trim(_version),coalesce(nullif(trim(_source),''),'web'),
    jsonb_build_object('creator_terms_acceptance_id',acceptance_id,'declaration_count',16,'metadata',coalesce(_metadata,'{}'::jsonb))
  );
  perform public.record_legal_acceptance(
    'privacy','1.0',coalesce(nullif(trim(_source),''),'web'),
    jsonb_build_object('source_document','creator_terms','creator_terms_version',trim(_version),'creator_terms_acceptance_id',acceptance_id)
  );
  perform public.record_legal_acceptance(
    'content_prohibited','1.0',coalesce(nullif(trim(_source),''),'web'),
    jsonb_build_object('source_document','creator_terms','creator_terms_version',trim(_version),'creator_terms_acceptance_id',acceptance_id)
  );

  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(auth.uid(),auth.uid(),'creator.terms.accepted',jsonb_build_object('version',trim(_version),'acceptance_id',acceptance_id));

  return acceptance_id;
end
$function$;

create or replace function public.create_creator_channel(
  _handle text,
  _display_name text,
  _bio text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  channel_id uuid:=gen_random_uuid();
  normalized_handle citext:=lower(trim(_handle));
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.has_role(auth.uid(),'creator')
     or not public.is_age_verified(auth.uid())
     or not public.has_current_creator_terms(auth.uid())
     or not exists (select 1 from public.kyc_verifications where user_id=auth.uid() and status='approved') then
    raise exception 'creator_verification_required';
  end if;
  if normalized_handle !~ '^[a-z0-9_]{3,24}$' then raise exception 'invalid_channel_handle'; end if;
  if nullif(trim(_display_name),'') is null then raise exception 'display_name_required'; end if;
  if exists(select 1 from public.channels where handle=normalized_handle) then raise exception 'channel_handle_taken'; end if;
  insert into public.channels(id,owner_id,handle,display_name,bio)
  values(channel_id,auth.uid(),normalized_handle,trim(_display_name),nullif(trim(_bio),''));
  return channel_id;
end
$function$;

create or replace function public.create_post(
  _channel uuid,
  _caption text default null,
  _visibility visibility default 'subscribers',
  _min_tier_rank smallint default null,
  _price bigint default null,
  _is_story boolean default false,
  _expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare post_id uuid:=gen_random_uuid(); channel_owner uuid; expiry timestamptz:=_expires_at;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select owner_id into channel_owner from public.channels where id=_channel;
  if channel_owner is null or channel_owner<>auth.uid() then raise exception 'channel_forbidden'; end if;
  if not public.is_age_verified(auth.uid()) then raise exception 'creator_verification_required'; end if;
  if not exists (select 1 from public.kyc_verifications where user_id=auth.uid() and status='approved') then
    raise exception 'creator_verification_required';
  end if;
  if not public.has_current_creator_terms(auth.uid())
     or not public.has_legal_acceptance(auth.uid(),'content_prohibited','1.0') then
    raise exception 'content_terms_required';
  end if;
  if _visibility='ppv' and coalesce(_price,0)<=0 then raise exception 'ppv_price_required'; end if;
  if _visibility='tier' and coalesce(_min_tier_rank,0) not between 1 and 4 then raise exception 'tier_required'; end if;
  if _visibility<>'ppv' and _price is not null then raise exception 'price_visibility_mismatch'; end if;
  if _is_story and expiry is null then expiry:=now()+interval '24 hours'; end if;
  if _is_story and expiry<=now() then raise exception 'story_expiry_invalid'; end if;
  if length(coalesce(_caption,''))>5000 then raise exception 'caption_too_long'; end if;
  insert into public.posts(id,channel_id,caption,visibility,min_tier_rank,price,status,publish_at,expires_at,is_story,moderation_status)
  values(post_id,_channel,nullif(trim(_caption),''),_visibility,_min_tier_rank,_price,'draft',null,expiry,_is_story,'pending');
  return post_id;
end
$function$;

create or replace function public.publish_post(_post uuid,_scheduled_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare p public.posts; media_count integer; ready_count integer;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select p0.* into p
  from public.posts p0 join public.channels c on c.id=p0.channel_id
  where p0.id=_post and c.owner_id=auth.uid()
  for update;
  if not found then raise exception 'post_not_found'; end if;
  if not public.has_current_creator_terms(auth.uid())
     or not public.has_legal_acceptance(auth.uid(),'content_prohibited','1.0') then
    raise exception 'content_terms_required';
  end if;
  if not exists (select 1 from public.kyc_verifications where user_id=auth.uid() and status='approved') then
    raise exception 'creator_verification_required';
  end if;

  select count(*) into media_count from public.media_assets where post_id=p.id and deleted_at is null;
  if media_count=0 then raise exception 'media_required'; end if;
  select count(*) into ready_count
  from public.media_assets
  where post_id=p.id and deleted_at is null
    and integrity_status='verified' and moderation_status='clean'
    and scan_status='clean' and processing_status='ready';
  if ready_count<>media_count then raise exception 'media_not_ready'; end if;

  perform set_config('app.internal_write','on',true);

  if _scheduled_at is not null and _scheduled_at>now() then
    update public.posts set status='scheduled',publish_at=_scheduled_at,moderation_status='clean',publication_reason='scheduled' where id=p.id;
  else
    update public.posts set status='published',publish_at=now(),moderation_status='clean',publication_reason='published' where id=p.id;
  end if;

  insert into public.content_archive_events(post_id,event_type,actor_id,reason,snapshot)
  values(p.id,'published',auth.uid(),'post_published',jsonb_build_object('visibility',p.visibility,'scheduled_at',_scheduled_at));
end
$function$;

create or replace function public.request_payout(_amount bigint,_method text,_destination jsonb,_idem text)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare payout_id uuid:=gen_random_uuid(); txn uuid:=gen_random_uuid(); existing uuid; bal bigint; min_amount bigint; kyc_ok boolean; secret text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.has_role(auth.uid(),'creator') then raise exception 'creator_required'; end if;
  if not public.has_current_creator_terms(auth.uid()) then raise exception 'creator_terms_required'; end if;
  perform public.require_recent_financial_mfa(600);
  if _amount<=0 then raise exception 'invalid_amount'; end if;
  if _method not in ('mpesa','emola','mkesh','ponto24','bank','card') then raise exception 'unsupported_payout_method'; end if;
  if _destination is null or jsonb_typeof(_destination)<>'object' then raise exception 'destination_required'; end if;
  if _idem is null or char_length(trim(_idem))<8 or char_length(_idem)>128 then raise exception 'idempotency_key_required'; end if;
  select id into existing from public.payouts where owner_id=auth.uid() and idempotency_key=_idem for update;
  if found then return existing; end if;
  select exists(select 1 from public.kyc_verifications where user_id=auth.uid() and status='approved') into kyc_ok;
  if not kyc_ok then raise exception 'kyc_required'; end if;
  min_amount:=coalesce((select (value#>>'{}')::bigint from public.platform_settings where key='payout.min_centavos'),50000);
  if _amount<min_amount then raise exception 'payout_below_minimum'; end if;
  secret:=public.financial_secret('prively_payout_encryption_key');
  if secret is null then raise exception 'financial_secret_not_configured'; end if;
  select balance into bal from public.balances where owner_id=auth.uid() and account='creator_available' for update;
  if coalesce(bal,0)<_amount then raise exception 'insufficient_available_earnings'; end if;
  insert into public.payouts(id,owner_id,amount,method,destination_ciphertext,destination_masked,idempotency_key,hold_txn_id)
  values(payout_id,auth.uid(),_amount,_method,extensions.pgp_sym_encrypt(_destination::text,secret),public.mask_payout_destination(_method,_destination),_idem,txn)
  on conflict(owner_id,idempotency_key) do nothing;
  select id into existing from public.payouts where owner_id=auth.uid() and idempotency_key=_idem for update;
  if existing<>payout_id then return existing; end if;
  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata)
  values
    (txn,'creator_available',auth.uid(),-_amount,'payout_hold','payout',payout_id,jsonb_build_object('payout_id',payout_id)),
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,_amount,'payout_hold','payout',payout_id,jsonb_build_object('payout_id',payout_id));
  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'payout.requested','payout',payout_id::text,jsonb_build_object('amount',_amount,'method',_method,'mfa','recent','phone_confirmed',true));
  return payout_id;
end
$function$;

create or replace function public.create_referral_code(_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare id uuid:=gen_random_uuid();
begin
  if not public.has_role(auth.uid(),'creator') then raise exception 'creator_required'; end if;
  if not public.has_current_creator_terms(auth.uid()) then raise exception 'creator_terms_required'; end if;
  if trim(_code)!~'^[a-z0-9_]{4,24}$' then raise exception 'invalid_referral_code'; end if;
  insert into public.referral_codes(id,creator_id,code) values(id,auth.uid(),lower(trim(_code)));
  return id;
end
$function$;

create or replace function public.accept_agency_invite(_agency uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.has_role(auth.uid(),'creator') then raise exception 'creator_required'; end if;
  if not public.has_current_creator_terms(auth.uid()) then raise exception 'creator_terms_required'; end if;
  update public.agency_members
  set status='active',accepted_at=now(),consent_at=now(),left_at=null
  where agency_id=_agency and creator_id=auth.uid() and status='invited';
  if not found then raise exception 'agency_invite_not_found'; end if;
  update public.channels set agency_id=_agency where owner_id=auth.uid();
end
$function$;

revoke execute on function public.has_current_creator_terms(uuid) from public, anon;
grant execute on function public.has_current_creator_terms(uuid) to authenticated;
