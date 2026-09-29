-- Phase 8 precision hardening: preserve exact target linkage and audit actual private reads.

alter table public.moderation_queue
  add column if not exists appeal_id uuid references public.appeals(id) on delete set null;

create index if not exists moderation_queue_appeal_idx on public.moderation_queue(appeal_id);

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
  q_type text := 'report';
  v_post uuid;
  v_asset uuid;
  v_message uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if _target_id is null then raise exception 'target_required'; end if;

  if _reason_code in ('minor_suspected','non_consensual','illegal_content','threat','safety') then
    p := 'critical';
  elsif _reason_code in ('doxxing','privacy','leak','copyright') then
    p := 'high';
  end if;

  if _target_type = 'post' then v_post := _target_id; end if;
  if _target_type = 'media' then v_asset := _target_id; end if;
  if _target_type = 'message' then v_message := _target_id; end if;
  if _target_type = 'dmca' then q_type := 'dmca'; end if;
  if _target_type = 'safety' then q_type := 'safety'; end if;

  insert into public.reports(reporter_id,target_type,target_id,reason_code,details,priority)
  values(auth.uid(),_target_type,_target_id,_reason_code,nullif(trim(_details),''),p)
  returning id into r_id;

  insert into public.moderation_queue(
    report_id,post_id,asset_id,message_id,queue_type,priority
  )
  values(
    r_id,v_post,v_asset,v_message,q_type,p
  )
  on conflict do nothing;

  perform public.phase8_audit(
    'report_created',
    _target_type,
    _target_id,
    _reason_code,
    jsonb_build_object('report_id',r_id,'priority',p)
  );

  return r_id;
end;
$phase8$;

create or replace function public.submit_appeal(_queue_id uuid,_statement text)
returns uuid
language plpgsql security definer set search_path=public
as $phase8$
declare
  a_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if char_length(trim(_statement)) < 20 then raise exception 'appeal_too_short'; end if;

  insert into public.appeals(queue_id,appellant_id,statement)
  values(_queue_id,auth.uid(),trim(_statement))
  returning id into a_id;

  update public.moderation_queue
     set status='in_review',updated_at=now()
   where id=_queue_id and status in ('resolved','dismissed');

  insert into public.moderation_queue(
    appeal_id,queue_type,priority,status
  )
  values(a_id,'appeal','high','open');

  perform public.phase8_audit(
    'appeal_created',
    'moderation_queue',
    _queue_id,
    null,
    jsonb_build_object('appeal_id',a_id)
  );

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
declare
  q public.moderation_queue;
  r public.reports;
  target_user uuid;
  target_type text;
  target_id uuid;
begin
  if not public.phase8_moderator_or_compliance(auth.uid()) then raise exception 'forbidden'; end if;
  if char_length(trim(_reason)) < 12 then raise exception 'reason_required'; end if;

  select * into q
  from public.moderation_queue
  where id=_queue_id
  for update;

  if not found then raise exception 'queue_not_found'; end if;

  insert into public.moderation_actions(queue_id,actor_id,action,reason)
  values(_queue_id,auth.uid(),_action,trim(_reason));

  if q.report_id is not null then
    select * into r from public.reports where id=q.report_id for update;
    target_type := r.target_type;
    target_id := r.target_id;

    update public.reports
       set status=case when _action in ('dismiss','mark_safe') then 'rejected' else 'resolved' end,
           resolved_at=now()
     where id=q.report_id;
  end if;

  if target_type = 'profile' then
    target_user := target_id;
  elsif target_type = 'post' then
    select c.owner_id into target_user
    from public.posts p
    join public.channels c on c.id=p.channel_id
    where p.id=target_id;
  elsif target_type = 'message' then
    select m.sender_id into target_user from public.messages m where m.id=target_id;
  elsif target_type = 'comment' then
    select c.user_id into target_user from public.comments c where c.id=target_id;
  elsif target_type = 'media' then
    select c.owner_id into target_user
    from public.media_assets a
    join public.channels c on c.id=a.channel_id
    where a.id=target_id;
  elsif target_type = 'meeting' then
    select c.owner_id into target_user
    from public.meeting_requests mr
    join public.channels c on c.id=mr.channel_id
    where mr.id=target_id;
  end if;

  if _action='remove_content' then
    if q.post_id is not null then
      update public.posts set status='removed' where id=q.post_id;
    end if;
    if q.asset_id is not null then
      update public.media_assets
         set moderation_status='flagged',processing_status='blocked'
       where id=q.asset_id;
    end if;
  elsif _action='restore_content' then
    if q.post_id is not null then
      update public.posts set status='published' where id=q.post_id;
    end if;
    if q.asset_id is not null then
      update public.media_assets
         set moderation_status='clean',
             processing_status=case when processing_status='blocked' then 'ready' else processing_status end
       where id=q.asset_id;
    end if;
  elsif _action in ('suspend_user','ban_user') and target_user is not null then
    update public.profiles
       set status=case when _action='ban_user' then 'banned' else 'suspended' end
     where id=target_user;
  end if;

  update public.moderation_queue
     set status=case when _action='dismiss' then 'dismissed' else 'resolved' end,
         updated_at=now(),
         resolved_at=now()
   where id=_queue_id;

  perform public.phase8_audit(
    'moderation_case_resolved',
    'moderation_queue',
    _queue_id,
    _action,
    jsonb_build_object('reason',_reason,'target_type',target_type,'target_id',target_id,'target_user',target_user)
  );

  return true;
end;
$phase8$;

create or replace function public.approve_compliance_access(_request_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $phase8$
declare
  r public.compliance_access_requests;
  approver uuid;
begin
  if not public.phase8_can_compliance_read(auth.uid()) then raise exception 'forbidden'; end if;

  select * into r
  from public.compliance_access_requests
  where id=_request_id
  for update;

  if not found then raise exception 'access_request_not_found'; end if;
  if r.status <> 'pending' then raise exception 'access_request_not_pending'; end if;

  if r.legal_order then
    update public.compliance_access_requests
       set status='approved',
           approved_at=now()
     where id=_request_id;
  elsif r.requester_id <> auth.uid() then
    approver := auth.uid();
    update public.compliance_access_requests
       set status='approved',
           second_approver_id=approver,
           approved_at=now()
     where id=_request_id;
  else
    raise exception 'second_approval_required';
  end if;

  insert into public.admin_access_log(
    actor_id,target_type,target_id,access_type,reason,legal_order,second_approver_id
  )
  values(
    auth.uid(),r.target_type,r.target_id,'decision',r.reason,r.legal_order,
    case when r.legal_order then null else approver end
  );

  perform public.phase8_audit(
    'compliance_access_approved',
    r.target_type,
    r.target_id,
    r.reason,
    jsonb_build_object('request_id',_request_id,'legal_order',r.legal_order)
  );

  return true;
end;
$phase8$;

create or replace function public.compliance_read_message(
  _request_id uuid,
  _message_id uuid
)
returns table(
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  kind text,
  body text,
  price bigint,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql security definer set search_path=public
as $phase8$
declare
  access_row public.compliance_access_requests;
begin
  if not public.compliance_access_valid(_request_id) then
    raise exception 'compliance_access_required';
  end if;

  select * into access_row
  from public.compliance_access_requests
  where id=_request_id
    and target_type in ('message','conversation');

  if not found then raise exception 'target_not_authorized'; end if;

  if access_row.target_type='message' and access_row.target_id <> _message_id then
    raise exception 'target_not_authorized';
  end if;

  insert into public.admin_access_log(
    actor_id,target_type,target_id,access_type,reason,legal_order,second_approver_id
  )
  values(
    auth.uid(),'message',_message_id,'view',access_row.reason,access_row.legal_order,access_row.second_approver_id
  );

  perform public.phase8_audit(
    'compliance_private_message_view',
    'message',
    _message_id,
    access_row.reason,
    jsonb_build_object('request_id',_request_id)
  );

  return query
  select m.id,m.conversation_id,m.sender_id,m.kind,m.body,m.price,m.created_at,m.read_at
  from public.messages m
  where m.id=_message_id
    and (
      access_row.target_type='message'
      or m.conversation_id=access_row.target_id
    );
end;
$phase8$;

create or replace function public.phase8_process_due_safety_alerts()
returns integer
language plpgsql security definer set search_path=public
as $phase8$
declare
  n integer := 0;
  item record;
  staff record;
begin
  for item in
    update public.safety_checkins
       set status='alerted',alerted_at=now()
     where status='active'
       and expected_end + make_interval(mins => tolerance_minutes) <= now()
     returning id,user_id
  loop
    n := n + 1;

    for staff in
      select user_id
      from public.user_roles
      where role in ('support'::app_role,'moderator'::app_role,'compliance'::app_role,'admin'::app_role)
    loop
      insert into public.notifications(user_id,kind,payload)
      values(
        staff.user_id,
        'safety_alert',
        jsonb_build_object(
          'event','checkin_expired',
          'checkin_id',item.id,
          'user_id',item.user_id
        )
      );
    end loop;

    perform public.phase8_audit(
      'safety_checkin_alerted',
      'safety_checkin',
      item.id,
      'checkin_expired',
      '{}'::jsonb
    );
  end loop;

  return n;
end;
$phase8$;

comment on column public.moderation_queue.appeal_id is
  'Links appeal cases to the originating moderation queue without exposing private evidence.';

