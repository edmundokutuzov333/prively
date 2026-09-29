-- Prively Phase 8: Safety, Meetings, Moderation & Trust
-- Production migration. No demo data and no monetisation fields on meetings.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  target_type text not null check (target_type in ('profile','post','message','meeting','comment','media','dmca','safety','leak')),
  target_id uuid,
  reason_code text not null check (reason_code in (
    'minor_suspected','non_consensual','illegal_content','harassment','threat','doxxing',
    'scam','copyright','privacy','spam','self_harm','safety','leak','other'
  )),
  details text,
  status text not null default 'pending' check (status in ('pending','triaged','resolved','rejected','appealed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists reports_status_priority_idx on public.reports(status,priority,created_at);
create index if not exists reports_reporter_idx on public.reports(reporter_id,created_at desc);
create index if not exists reports_target_idx on public.reports(target_type,target_id);

create table if not exists public.moderation_queue (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  asset_id uuid references public.media_assets(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  queue_type text not null check (queue_type in ('report','ai_scan','dmca','safety','appeal')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'open' check (status in ('open','in_review','resolved','dismissed')),
  ai_status text not null default 'not_run' check (ai_status in ('not_run','queued','running','clean','flagged','unavailable','error')),
  ai_categories jsonb not null default '[]'::jsonb,
  ai_score numeric check (ai_score is null or (ai_score >= 0 and ai_score <= 1)),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists moderation_queue_open_idx on public.moderation_queue(status,priority,created_at);
create index if not exists moderation_queue_assignee_idx on public.moderation_queue(assigned_to,status);
create unique index if not exists moderation_queue_report_open_uidx
  on public.moderation_queue(report_id)
  where report_id is not null and status in ('open','in_review');

create table if not exists public.moderation_actions (
  id bigint generated always as identity primary key,
  queue_id uuid not null references public.moderation_queue(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in (
    'assign','remove_content','restore_content','suspend_user','ban_user',
    'warn_user','escalate','dismiss','close','mark_safe','require_more_evidence'
  )),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists moderation_actions_queue_idx on public.moderation_actions(queue_id,created_at desc);

create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.moderation_queue(id) on delete restrict,
  appellant_id uuid not null references public.profiles(id) on delete restrict,
  statement text not null,
  status text not null default 'pending' check (status in ('pending','reviewing','upheld','overturned','rejected')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists appeals_status_idx on public.appeals(status,created_at);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  target_type text,
  target_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  previous_hash text,
  event_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_target_idx on public.audit_log(target_type,target_id,created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log(actor_id,created_at desc);

create table if not exists public.admin_access_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  target_type text not null,
  target_id uuid not null,
  access_type text not null check (access_type in ('view','export','download','decision')),
  reason text not null,
  legal_order boolean not null default false,
  second_approver_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists admin_access_log_target_idx on public.admin_access_log(target_type,target_id,created_at desc);
create index if not exists admin_access_log_actor_idx on public.admin_access_log(actor_id,created_at desc);

create table if not exists public.compliance_access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete restrict,
  target_type text not null check (target_type in ('report','post','message','asset','conversation','user','meeting')),
  target_id uuid not null,
  reason text not null check (char_length(trim(reason)) >= 12),
  legal_order boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','denied','expired')),
  second_approver_id uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now()
);

create index if not exists compliance_access_status_idx on public.compliance_access_requests(status,expires_at);
create index if not exists compliance_access_target_idx on public.compliance_access_requests(target_type,target_id);

create table if not exists public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  phone text not null,
  relationship text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,phone)
);

create index if not exists trusted_contacts_user_idx on public.trusted_contacts(user_id);

create table if not exists public.safety_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expected_end timestamptz not null,
  tolerance_minutes smallint not null default 15 check (tolerance_minutes between 5 and 120),
  status text not null default 'active' check (status in ('active','confirmed','alerted','cancelled','expired')),
  share_location boolean not null default false,
  last_ping timestamptz,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  alerted_at timestamptz
);

create index if not exists safety_checkins_active_idx on public.safety_checkins(user_id,status,expected_end);

create table if not exists public.panic_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null default 'button' check (source in ('button','checkin','support')),
  share_location boolean not null default false,
  location_id uuid,
  alert_status text not null default 'queued' check (alert_status in ('queued','sent','partial','failed','not_configured')),
  support_notified_at timestamptz,
  contacts_notified_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists panic_events_user_idx on public.panic_events(user_id,created_at desc);
create index if not exists panic_events_open_idx on public.panic_events(alert_status,created_at desc);

create table if not exists public.safety_location_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('panic','checkin')),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  expires_at timestamptz not null,
  purged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists safety_location_expiry_idx on public.safety_location_shares(expires_at) where purged_at is null;

create table if not exists public.safe_venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('cafe','restaurante','centro_comercial')),
  city text not null,
  bairro text,
  approx_lat numeric(8,5),
  approx_lng numeric(8,5),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists safe_venues_active_idx on public.safe_venues(active,city,bairro);

create table if not exists public.meeting_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete restrict,
  channel_id uuid not null references public.channels(id) on delete restrict,
  availability_slot_id uuid not null references public.availability_slots(id) on delete restrict,
  safe_venue_id uuid not null references public.safe_venues(id) on delete restrict,
  proposed_at timestamptz not null,
  note text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled','expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists meeting_requests_channel_idx on public.meeting_requests(channel_id,status,created_at desc);
create index if not exists meeting_requests_client_idx on public.meeting_requests(client_id,status,created_at desc);

create table if not exists public.dmca_requests (
  id uuid primary key default gen_random_uuid(),
  claimant_name text not null,
  claimant_email text not null,
  copyrighted_work text not null,
  target_url text not null,
  statement text not null,
  signature_name text not null,
  status text not null default 'pending' check (status in ('pending','reviewing','removed','rejected','counter_notice')),
  report_id uuid references public.reports(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists dmca_status_idx on public.dmca_requests(status,created_at);

create table if not exists public.legal_holds (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  target_type text not null check (target_type in ('post','asset','message','conversation','user','report')),
  target_id uuid not null,
  reason text not null check (char_length(trim(reason)) >= 12),
  status text not null default 'active' check (status in ('active','released')),
  released_by uuid references public.profiles(id) on delete restrict,
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists legal_holds_target_idx on public.legal_holds(target_type,target_id,status);

create table if not exists public.watermark_events (
  id bigint generated always as identity primary key,
  asset_id uuid not null references public.media_assets(id) on delete restrict,
  viewer_id uuid references public.profiles(id) on delete set null,
  token_hash text not null,
  context text not null check (context in ('view','download','preview','share')),
  created_at timestamptz not null default now()
);

create index if not exists watermark_events_asset_idx on public.watermark_events(asset_id,created_at desc);
create index if not exists watermark_events_viewer_idx on public.watermark_events(viewer_id,created_at desc);

-- Updated-at helper used only by Phase 8 mutable operational tables.
create or replace function public.phase8_touch_updated_at()
returns trigger language plpgsql security invoker
as $phase8$
begin
  new.updated_at := now();
  return new;
end;
$phase8$;

drop trigger if exists reports_touch_updated_at on public.reports;
create trigger reports_touch_updated_at before update on public.reports for each row execute function public.phase8_touch_updated_at();
drop trigger if exists moderation_queue_touch_updated_at on public.moderation_queue;
create trigger moderation_queue_touch_updated_at before update on public.moderation_queue for each row execute function public.phase8_touch_updated_at();
drop trigger if exists trusted_contacts_touch_updated_at on public.trusted_contacts;
create trigger trusted_contacts_touch_updated_at before update on public.trusted_contacts for each row execute function public.phase8_touch_updated_at();
drop trigger if exists safe_venues_touch_updated_at on public.safe_venues;
create trigger safe_venues_touch_updated_at before update on public.safe_venues for each row execute function public.phase8_touch_updated_at();

-- Append-only / tamper-evident audit primitives.
create or replace function public.phase8_set_audit_hash()
returns trigger language plpgsql security definer set search_path=public
as $phase8$
declare
  prev text;
begin
  select event_hash into prev from public.audit_log order by id desc limit 1;
  new.previous_hash := prev;
  new.event_hash := encode(
    digest(
      coalesce(new.previous_hash,'') || '|' ||
      coalesce(new.actor_id::text,'') || '|' ||
      new.event_type || '|' ||
      coalesce(new.target_type,'') || '|' ||
      coalesce(new.target_id::text,'') || '|' ||
      coalesce(new.reason,'') || '|' ||
      new.metadata::text || '|' ||
      new.created_at::text,
      'sha256'
    ), 'hex');
  return new;
end;
$phase8$;

create or replace function public.phase8_append_only()
returns trigger language plpgsql
as $phase8$
begin
  raise exception 'append_only';
end;
$phase8$;

drop trigger if exists audit_log_hash on public.audit_log;
create trigger audit_log_hash before insert on public.audit_log for each row execute function public.phase8_set_audit_hash();
drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable before update or delete on public.audit_log for each row execute function public.phase8_append_only();

drop trigger if exists admin_access_log_immutable on public.admin_access_log;
create trigger admin_access_log_immutable before update or delete on public.admin_access_log for each row execute function public.phase8_append_only();

drop trigger if exists moderation_actions_immutable on public.moderation_actions;
create trigger moderation_actions_immutable before update or delete on public.moderation_actions for each row execute function public.phase8_append_only();

create or replace function public.phase8_audit(
  _event_type text,
  _target_type text default null,
  _target_id uuid default null,
  _reason text default null,
  _metadata jsonb default '{}'::jsonb
)
returns bigint
language sql security definer set search_path=public
as $phase8$
  insert into public.audit_log(actor_id,event_type,target_type,target_id,reason,metadata)
  values(auth.uid(),_event_type,_target_type,_target_id,_reason,coalesce(_metadata,'{}'::jsonb))
  returning id;
$phase8$;

create or replace function public.phase8_moderator_or_compliance(_uid uuid)
returns boolean
language sql stable security definer set search_path=public
as $phase8$
  select public.has_role(_uid,'moderator'::app_role)
      or public.has_role(_uid,'compliance'::app_role)
      or public.has_role(_uid,'admin'::app_role);
$phase8$;

create or replace function public.phase8_can_compliance_read(_uid uuid)
returns boolean
language sql stable security definer set search_path=public
as $phase8$
  select public.has_role(_uid,'compliance'::app_role)
      or public.has_role(_uid,'admin'::app_role);
$phase8$;

create or replace function public.submit_report(
  _target_type text,
  _target_id uuid,
  _reason_code text,
  _details text default null
)
returns uuid
language plpgsql security definer set search_path=public
as $phase8$
declare
  r_id uuid;
  p text := 'normal';
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if _target_id is null then raise exception 'target_required'; end if;
  if _reason_code in ('minor_suspected','non_consensual','illegal_content','threat','safety') then
    p := 'critical';
  elsif _reason_code in ('doxxing','privacy','leak','copyright') then
    p := 'high';
  end if;

  insert into public.reports(reporter_id,target_type,target_id,reason_code,details,priority)
  values(auth.uid(),_target_type,_target_id,_reason_code,nullif(trim(_details),''),p)
  returning id into r_id;

  insert into public.moderation_queue(report_id,queue_type,priority)
  values(r_id,case when _target_type='dmca' then 'dmca' when _target_type='safety' then 'safety' else 'report' end,p)
  on conflict do nothing;

  perform public.phase8_audit('report_created',_target_type,_target_id,_reason_code,
    jsonb_build_object('report_id',r_id,'priority',p));
  return r_id;
end;
$phase8$;

create or replace function public.submit_appeal(_queue_id uuid,_statement text)
returns uuid
language plpgsql security definer set search_path=public
as $phase8$
declare a_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if char_length(trim(_statement)) < 20 then raise exception 'appeal_too_short'; end if;

  insert into public.appeals(queue_id,appellant_id,statement)
  values(_queue_id,auth.uid(),trim(_statement))
  returning id into a_id;

  update public.moderation_queue
     set status='in_review',updated_at=now()
   where id=_queue_id and status in ('resolved','dismissed');

  insert into public.moderation_queue(queue_type,priority,status)
  values('appeal','high','open')
  on conflict do nothing;

  perform public.phase8_audit('appeal_created','moderation_queue',_queue_id,null,jsonb_build_object('appeal_id',a_id));
  return a_id;
end;
$phase8$;

create or replace function public.resolve_moderation_case(
  _queue_id uuid,
  _action text,
  _reason text
)
returns boolean
language plpgsql security definer set search_path=public
as $phase8$
declare q public.moderation_queue;
    target_user uuid;
begin
  if not public.phase8_moderator_or_compliance(auth.uid()) then raise exception 'forbidden'; end if;
  if char_length(trim(_reason)) < 12 then raise exception 'reason_required'; end if;

  select * into q from public.moderation_queue where id=_queue_id for update;
  if not found then raise exception 'queue_not_found'; end if;

  insert into public.moderation_actions(queue_id,actor_id,action,reason)
  values(_queue_id,auth.uid(),_action,trim(_reason));

  if q.report_id is not null then
    update public.reports
       set status=case when _action in ('dismiss','mark_safe') then 'rejected' else 'resolved' end,
           resolved_at=now()
     where id=q.report_id;
  end if;

  if _action='remove_content' then
    if q.post_id is not null then
      update public.posts set status='removed' where id=q.post_id;
    end if;
    if q.asset_id is not null then
      update public.media_assets set moderation_status='flagged',processing_status='blocked' where id=q.asset_id;
    end if;
  elsif _action='restore_content' then
    if q.post_id is not null then
      update public.posts set status='published' where id=q.post_id;
    end if;
    if q.asset_id is not null then
      update public.media_assets set moderation_status='clean',processing_status=case when processing_status='blocked' then 'ready' else processing_status end where id=q.asset_id;
    end if;
  elsif _action in ('suspend_user','ban_user') then
    if q.report_id is not null then
      select coalesce(
        (select p.owner_id from public.channels c join public.posts p on p.channel_id=c.id where p.id=q.post_id limit 1),
        (select p2.owner_id from public.channels c2 join public.posts p2 on p2.channel_id=c2.id where p2.id=q.post_id limit 1)
      ) into target_user;
    end if;
    if target_user is not null then
      update public.profiles set status=case when _action='ban_user' then 'banned' else 'suspended' end where id=target_user;
    end if;
  end if;

  update public.moderation_queue
     set status=case when _action='dismiss' then 'dismissed' else 'resolved' end,
         updated_at=now(),
         resolved_at=now()
   where id=_queue_id;

  perform public.phase8_audit('moderation_case_resolved','moderation_queue',_queue_id,_action,
    jsonb_build_object('reason',_reason));
  return true;
end;
$phase8$;

create or replace function public.claim_moderation_case(_queue_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $phase8$
begin
  if not public.phase8_moderator_or_compliance(auth.uid()) then raise exception 'forbidden'; end if;
  update public.moderation_queue
     set assigned_to=auth.uid(),status='in_review',updated_at=now()
   where id=_queue_id and status='open';
  if not found then return false; end if;
  perform public.phase8_audit('moderation_case_claimed','moderation_queue',_queue_id,null,'{}'::jsonb);
  return true;
end;
$phase8$;

create or replace function public.request_compliance_access(
  _target_type text,
  _target_id uuid,
  _reason text,
  _legal_order boolean default false
)
returns uuid
language plpgsql security definer set search_path=public
as $phase8$
declare r_id uuid;
begin
  if not public.phase8_can_compliance_read(auth.uid()) then raise exception 'forbidden'; end if;
  if char_length(trim(_reason)) < 12 then raise exception 'reason_required'; end if;
  insert into public.compliance_access_requests(requester_id,target_type,target_id,reason,legal_order)
  values(auth.uid(),_target_type,_target_id,trim(_reason),_legal_order)
  returning id into r_id;

  perform public.phase8_audit('compliance_access_requested',_target_type,_target_id,trim(_reason),
    jsonb_build_object('access_request_id',r_id,'legal_order',_legal_order));

  return r_id;
end;
$phase8$;

create or replace function public.approve_compliance_access(_request_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $phase8$
declare r public.compliance_access_requests;
begin
  if not public.phase8_can_compliance_read(auth.uid()) then raise exception 'forbidden'; end if;
  select * into r from public.compliance_access_requests where id=_request_id for update;
  if not found then raise exception 'access_request_not_found'; end if;
  if r.status <> 'pending' then raise exception 'access_request_not_pending'; end if;

  if r.legal_order or r.requester_id <> auth.uid() then
    update public.compliance_access_requests
       set status='approved',second_approver_id=case when r.requester_id<>auth.uid() then auth.uid() else null end,approved_at=now()
     where id=_request_id;
  else
    raise exception 'second_approval_required';
  end if;

  insert into public.admin_access_log(actor_id,target_type,target_id,access_type,reason,legal_order,second_approver_id)
  values(r.requester_id,r.target_type,r.target_id,'view',r.reason,r.legal_order,
         case when r.requester_id<>auth.uid() then auth.uid() else null end);

  perform public.phase8_audit('compliance_access_approved',r.target_type,r.target_id,r.reason,
    jsonb_build_object('request_id',_request_id,'legal_order',r.legal_order));

  return true;
end;
$phase8$;

create or replace function public.compliance_access_valid(_request_id uuid)
returns boolean
language sql stable security definer set search_path=public
as $phase8$
  select exists(
    select 1
    from public.compliance_access_requests r
    where r.id=_request_id
      and r.status='approved'
      and r.expires_at > now()
      and public.phase8_can_compliance_read(auth.uid())
      and (r.requester_id=auth.uid() or r.second_approver_id=auth.uid())
  );
$phase8$;

create or replace function public.compliance_read_message(_request_id uuid,_message_id uuid)
returns table(id uuid,conversation_id uuid,sender_id uuid,kind text,body text,price bigint,created_at timestamptz,read_at timestamptz)
language plpgsql security definer set search_path=public
as $phase8$
begin
  if not public.compliance_access_valid(_request_id) then raise exception 'compliance_access_required'; end if;
  if not exists(select 1 from public.compliance_access_requests where id=_request_id and target_type in ('message','conversation')) then
    raise exception 'target_not_authorized';
  end if;
  perform public.phase8_audit('compliance_private_message_view','message',_message_id,
    (select reason from public.compliance_access_requests where id=_request_id),
    jsonb_build_object('request_id',_request_id));
  return query select m.id,m.conversation_id,m.sender_id,m.kind,m.body,m.price,m.created_at,m.read_at
  from public.messages m
  where m.id=_message_id;
end;
$phase8$;

create or replace function public.create_safety_checkin(
  _expected_end timestamptz,
  _tolerance_minutes smallint default 15,
  _share_location boolean default false
)
returns uuid
language plpgsql security definer set search_path=public
as $phase8$
declare r_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if _expected_end <= now() then raise exception 'invalid_expected_end'; end if;
  insert into public.safety_checkins(user_id,expected_end,tolerance_minutes,share_location)
  values(auth.uid(),_expected_end,_tolerance_minutes,_share_location)
  returning id into r_id;
  perform public.phase8_audit('safety_checkin_created','safety_checkin',r_id,null,
    jsonb_build_object('share_location',_share_location));
  return r_id;
end;
$phase8$;

create or replace function public.confirm_safety_checkin(_checkin_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $phase8$
begin
  update public.safety_checkins set status='confirmed',confirmed_at=now()
   where id=_checkin_id and user_id=auth.uid() and status='active';
  if not found then raise exception 'checkin_not_found'; end if;
  perform public.phase8_audit('safety_checkin_confirmed','safety_checkin',_checkin_id);
  return true;
end;
$phase8$;

create or replace function public.create_panic_event(
  _share_location boolean default false,
  _location_id uuid default null
)
returns uuid
language plpgsql security definer set search_path=public
as $phase8$
declare p_id uuid;
begin
  insert into public.panic_events(user_id,share_location,location_id)
  values(auth.uid(),_share_location,_location_id)
  returning id into p_id;

  update public.safety_checkins set status='alerted',alerted_at=now()
  where user_id=auth.uid() and status='active';

  perform public.phase8_audit('panic_event_created','panic_event',p_id,null,
    jsonb_build_object('share_location',_share_location));

  return p_id;
end;
$phase8$;

create or replace function public.add_safety_location(
  _source text,
  _latitude numeric,
  _longitude numeric
)
returns uuid
language plpgsql security definer set search_path=public
as $phase8$
declare id uuid;
begin
  if _source not in ('panic','checkin') then raise exception 'invalid_location_source'; end if;
  insert into public.safety_location_shares(user_id,source,latitude,longitude,expires_at)
  values(auth.uid(),_source,_latitude,_longitude,now()+interval '24 hours')
  returning safety_location_shares.id into id;
  return id;
end;
$phase8$;

create or replace function public.create_meeting_request(
  _channel_id uuid,
  _availability_slot_id uuid,
  _safe_venue_id uuid,
  _proposed_at timestamptz,
  _note text default null
)
returns uuid
language plpgsql security definer set search_path=public
as $phase8$
declare id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;

  if not exists(
    select 1 from public.availability_slots s
    where s.id=_availability_slot_id
      and s.channel_id=_channel_id
      and s.starts_at <= _proposed_at
      and s.ends_at >= _proposed_at
  ) then raise exception 'availability_unavailable'; end if;

  if not exists(select 1 from public.safe_venues v where v.id=_safe_venue_id and v.active) then raise exception 'safe_venue_unavailable'; end if;

  if exists(
    select 1 from public.blocks b
    join public.channels c on c.owner_id=b.blocked_user_id
    where c.id=_channel_id
      and ((b.owner_id=auth.uid() and b.blocked_user_id=c.owner_id) or (b.owner_id=c.owner_id and b.blocked_user_id=auth.uid()))
  ) then raise exception 'user_blocked'; end if;

  insert into public.meeting_requests(client_id,channel_id,availability_slot_id,safe_venue_id,proposed_at,note)
  values(auth.uid(),_channel_id,_availability_slot_id,_safe_venue_id,_proposed_at,nullif(trim(_note),'')) returning meeting_requests.id into id;

  perform public.phase8_audit('meeting_request_created','meeting',id,null,'{}'::jsonb);
  return id;
end;
$phase8$;

create or replace function public.respond_meeting_request(_request_id uuid,_status text)
returns boolean
language plpgsql security definer set search_path=public
as $phase8$
declare r public.meeting_requests;
begin
  select * into r from public.meeting_requests where id=_request_id for update;
  if not found then raise exception 'meeting_not_found'; end if;
  if not exists(select 1 from public.channels where id=r.channel_id and owner_id=auth.uid()) then raise exception 'forbidden'; end if;
  if _status not in ('accepted','declined') then raise exception 'invalid_meeting_status'; end if;

  update public.meeting_requests set status=_status,responded_at=now() where id=_request_id;
  perform public.phase8_audit('meeting_request_responded','meeting',_request_id,_status,'{}'::jsonb);
  return true;
end;
$phase8$;

create or replace function public.cancel_meeting_request(_request_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $phase8$
begin
  update public.meeting_requests r
  set status='cancelled'
  where r.id=_request_id and (
    r.client_id=auth.uid()
    or exists(select 1 from public.channels c where c.id=r.channel_id and c.owner_id=auth.uid())
  ) and r.status in ('pending','accepted');
  if not found then raise exception 'meeting_not_found'; end if;
  perform public.phase8_audit('meeting_request_cancelled','meeting',_request_id);
  return true;
end;
$phase8$;

create or replace function public.apply_legal_hold(
  _target_type text,
  _target_id uuid,
  _reason text
)
returns uuid
language plpgsql security definer set search_path=public
as $phase8$
declare id uuid;
begin
  if not public.phase8_can_compliance_read(auth.uid()) then raise exception 'forbidden'; end if;
  if char_length(trim(_reason)) < 12 then raise exception 'reason_required'; end if;

  insert into public.legal_holds(created_by,target_type,target_id,reason)
  values(auth.uid(),_target_type,_target_id,trim(_reason))
  returning legal_holds.id into id;

  perform public.phase8_audit('legal_hold_created',_target_type,_target_id,trim(_reason),
    jsonb_build_object('hold_id',id));
  return id;
end;
$phase8$;

create or replace function public.release_legal_hold(_hold_id uuid,_reason text)
returns boolean
language plpgsql security definer set search_path=public
as $phase8$
begin
  if not public.phase8_can_compliance_read(auth.uid()) then raise exception 'forbidden'; end if;
  update public.legal_holds set status='released',released_by=auth.uid(),released_at=now()
  where id=_hold_id and status='active';
  if not found then raise exception 'legal_hold_not_found'; end if;
  perform public.phase8_audit('legal_hold_released','legal_hold',_hold_id,_reason,'{}'::jsonb);
  return true;
end;
$phase8$;

create or replace function public.phase8_retention_allows_delete(_target_type text,_target_id uuid)
returns boolean
language sql stable security definer set search_path=public
as $phase8$
  select not exists(select 1 from public.legal_holds where target_type=_target_type and target_id=_target_id and status='active');
$phase8$;

create or replace function public.record_watermark_event(
  _asset_id uuid,
  _token_hash text,
  _context text
)
returns bigint
language plpgsql security definer set search_path=public
as $phase8$
declare id bigint;
begin
  if not public.is_age_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
  insert into public.watermark_events(asset_id,viewer_id,token_hash,context)
  values(_asset_id,auth.uid(),_token_hash,_context)
  returning watermark_events.id into id;
  return id;
end;
$phase8$;

create or replace function public.expire_safety_locations()
returns integer
language plpgsql security definer set search_path=public
as $phase8$
declare n integer;
begin
  update public.safety_location_shares
     set purged_at=now()
   where purged_at is null and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$phase8$;

create or replace function public.expire_meeting_requests()
returns integer
language plpgsql security definer set search_path=public
as $phase8$
declare n integer;
begin
  update public.meeting_requests
     set status='expired'
   where status='pending'
     and proposed_at < now();
  get diagnostics n = row_count;
  return n;
end;
$phase8$;

-- Explicit RLS: no generic admin bypass on these safety/privacy surfaces.
alter table public.reports enable row level security;
alter table public.moderation_queue enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.appeals enable row level security;
alter table public.audit_log enable row level security;
alter table public.admin_access_log enable row level security;
alter table public.compliance_access_requests enable row level security;
alter table public.trusted_contacts enable row level security;
alter table public.safety_checkins enable row level security;
alter table public.panic_events enable row level security;
alter table public.safety_location_shares enable row level security;
alter table public.safe_venues enable row level security;
alter table public.meeting_requests enable row level security;
alter table public.dmca_requests enable row level security;
alter table public.legal_holds enable row level security;
alter table public.watermark_events enable row level security;

drop policy if exists reports_own_read on public.reports;
create policy reports_own_read on public.reports for select to authenticated
using (reporter_id=(select auth.uid()) or public.phase8_moderator_or_compliance((select auth.uid())));

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
with check (reporter_id=(select auth.uid()));

drop policy if exists moderation_queue_staff on public.moderation_queue;
create policy moderation_queue_staff on public.moderation_queue for select to authenticated
using (public.phase8_moderator_or_compliance((select auth.uid())));

drop policy if exists moderation_actions_staff on public.moderation_actions;
create policy moderation_actions_staff on public.moderation_actions for select to authenticated
using (public.phase8_moderator_or_compliance((select auth.uid())));

drop policy if exists appeals_own_or_staff on public.appeals;
create policy appeals_own_or_staff on public.appeals for select to authenticated
using (appellant_id=(select auth.uid()) or public.phase8_moderator_or_compliance((select auth.uid())));

drop policy if exists audit_log_staff on public.audit_log;
create policy audit_log_staff on public.audit_log for select to authenticated
using (public.phase8_can_compliance_read((select auth.uid())));

drop policy if exists admin_access_log_staff on public.admin_access_log;
create policy admin_access_log_staff on public.admin_access_log for select to authenticated
using (public.phase8_can_compliance_read((select auth.uid())));

drop policy if exists compliance_requests_staff on public.compliance_access_requests;
create policy compliance_requests_staff on public.compliance_access_requests for select to authenticated
using (requester_id=(select auth.uid()) or public.phase8_can_compliance_read((select auth.uid())));

drop policy if exists trusted_contacts_own on public.trusted_contacts;
create policy trusted_contacts_own on public.trusted_contacts for all to authenticated
using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()));

drop policy if exists safety_checkins_own on public.safety_checkins;
create policy safety_checkins_own on public.safety_checkins for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists panic_events_own on public.panic_events;
create policy panic_events_own on public.panic_events for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists safety_locations_own on public.safety_location_shares;
create policy safety_locations_own on public.safety_location_shares for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists safe_venues_public_read on public.safe_venues;
create policy safe_venues_public_read on public.safe_venues for select to authenticated
using (active=true);

drop policy if exists safe_venues_staff_manage on public.safe_venues;
create policy safe_venues_staff_manage on public.safe_venues for all to authenticated
using (public.has_role((select auth.uid()),'admin'::app_role))
with check (public.has_role((select auth.uid()),'admin'::app_role));

drop policy if exists meeting_requests_parties on public.meeting_requests;
create policy meeting_requests_parties on public.meeting_requests for select to authenticated
using (
  client_id=(select auth.uid())
  or exists(select 1 from public.channels c where c.id=meeting_requests.channel_id and c.owner_id=(select auth.uid()))
);

drop policy if exists dmca_public_insert on public.dmca_requests;
create policy dmca_public_insert on public.dmca_requests for insert to anon,authenticated
with check (true);

drop policy if exists dmca_staff_read on public.dmca_requests;
create policy dmca_staff_read on public.dmca_requests for select to authenticated
using (public.phase8_moderator_or_compliance((select auth.uid())));

drop policy if exists legal_holds_staff on public.legal_holds;
create policy legal_holds_staff on public.legal_holds for select to authenticated
using (public.phase8_can_compliance_read((select auth.uid())));

drop policy if exists watermark_own_or_staff on public.watermark_events;
create policy watermark_own_or_staff on public.watermark_events for select to authenticated
using (viewer_id=(select auth.uid()) or public.phase8_can_compliance_read((select auth.uid())));

revoke all on public.audit_log from anon,authenticated;
revoke all on public.admin_access_log from anon,authenticated;
revoke all on public.moderation_actions from anon,authenticated;
revoke all on public.compliance_access_requests from anon,authenticated;
revoke all on public.safety_location_shares from anon,authenticated;
revoke all on public.legal_holds from anon,authenticated;

grant select on public.reports to authenticated;
grant select on public.moderation_queue to authenticated;
grant select on public.moderation_actions to authenticated;
grant select on public.appeals to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.admin_access_log to authenticated;
grant select on public.compliance_access_requests to authenticated;
grant select on public.trusted_contacts to authenticated;
grant select on public.safety_checkins to authenticated;
grant select on public.panic_events to authenticated;
grant select on public.safety_location_shares to authenticated;
grant select on public.safe_venues to authenticated;
grant select on public.meeting_requests to authenticated;
grant select on public.dmca_requests to authenticated;
grant select on public.legal_holds to authenticated;
grant select on public.watermark_events to authenticated;

revoke all on function public.submit_report(text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.submit_appeal(uuid,text) from public,anon,authenticated;
revoke all on function public.resolve_moderation_case(uuid,text,text) from public,anon,authenticated;
revoke all on function public.claim_moderation_case(uuid) from public,anon,authenticated;
revoke all on function public.request_compliance_access(text,uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.approve_compliance_access(uuid) from public,anon,authenticated;
revoke all on function public.compliance_read_message(uuid,uuid) from public,anon,authenticated;
revoke all on function public.create_safety_checkin(timestamptz,smallint,boolean) from public,anon,authenticated;
revoke all on function public.confirm_safety_checkin(uuid) from public,anon,authenticated;
revoke all on function public.create_panic_event(boolean,uuid) from public,anon,authenticated;
revoke all on function public.add_safety_location(text,numeric,numeric) from public,anon,authenticated;
revoke all on function public.create_meeting_request(uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.respond_meeting_request(uuid,text) from public,anon,authenticated;
revoke all on function public.cancel_meeting_request(uuid) from public,anon,authenticated;
revoke all on function public.apply_legal_hold(text,uuid,text) from public,anon,authenticated;
revoke all on function public.release_legal_hold(uuid,text) from public,anon,authenticated;
revoke all on function public.record_watermark_event(uuid,text,text) from public,anon,authenticated;

grant execute on function public.submit_report(text,uuid,text,text) to authenticated;
grant execute on function public.submit_appeal(uuid,text) to authenticated;
grant execute on function public.resolve_moderation_case(uuid,text,text) to authenticated;
grant execute on function public.claim_moderation_case(uuid) to authenticated;
grant execute on function public.request_compliance_access(text,uuid,text,boolean) to authenticated;
grant execute on function public.approve_compliance_access(uuid) to authenticated;
grant execute on function public.compliance_read_message(uuid,uuid) to authenticated;
grant execute on function public.create_safety_checkin(timestamptz,smallint,boolean) to authenticated;
grant execute on function public.confirm_safety_checkin(uuid) to authenticated;
grant execute on function public.create_panic_event(boolean,uuid) to authenticated;
grant execute on function public.add_safety_location(text,numeric,numeric) to authenticated;
grant execute on function public.create_meeting_request(uuid,uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.respond_meeting_request(uuid,text) to authenticated;
grant execute on function public.cancel_meeting_request(uuid) to authenticated;
grant execute on function public.apply_legal_hold(text,uuid,text) to authenticated;
grant execute on function public.release_legal_hold(uuid,text) to authenticated;
grant execute on function public.record_watermark_event(uuid,text,text) to authenticated;

insert into public.platform_settings(key,value)
values
  ('feature_flags.moderation','true'::jsonb),
  ('feature_flags.ai_moderation','false'::jsonb),
  ('feature_flags.meetings','true'::jsonb),
  ('feature_flags.safety_alerts','false'::jsonb)
on conflict(key) do update set value=excluded.value,updated_at=now();

create or replace function public.phase8_process_due_safety_alerts()
returns integer
language plpgsql security definer set search_path=public
as $phase8$
begin
  update public.safety_checkins
     set status='alerted',alerted_at=now()
   where status='active'
     and expected_end + make_interval(mins => tolerance_minutes) <= now();
  return (select count(*) from public.safety_checkins where status='alerted' and alerted_at > now()-interval '1 minute');
end;
$phase8$;

do $phase8$
begin
  if not exists(select 1 from cron.job where jobname='prively-expire-safety-locations') then
    perform cron.schedule('prively-expire-safety-locations','*/10 * * * *','select public.expire_safety_locations();');
  end if;
  if not exists(select 1 from cron.job where jobname='prively-expire-meeting-requests') then
    perform cron.schedule('prively-expire-meeting-requests','*/10 * * * *','select public.expire_meeting_requests();');
  end if;
  if not exists(select 1 from cron.job where jobname='prively-process-safety-alerts') then
    perform cron.schedule('prively-process-safety-alerts','*/5 * * * *','select public.phase8_process_due_safety_alerts();');
  end if;
end;
$phase8$;

comment on table public.meeting_requests is
  'Social meetings only. No price, payment, commission, escrow or sexual service fields are permitted.';
comment on table public.safe_venues is
  'Curated public venues only. Hotel/accommodation categories are intentionally not supported.';
comment on table public.compliance_access_requests is
  'Compliance View gate. Private content access must be justified, time-limited and approved by a second person for DMs unless a legal order exists.';
