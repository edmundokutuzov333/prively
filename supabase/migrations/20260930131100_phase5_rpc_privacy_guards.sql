-- Phase 5: privileged RPCs require the versioned privacy acceptance.

revoke execute on function public.send_message_v2(uuid,text,text,uuid,text) from authenticated;
create or replace function public.send_message_guarded(
  _conversation uuid,
  _body text default null,
  _kind text default 'text',
  _attachment_id uuid default null,
  _idem text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
begin
  perform public.assert_communication_privacy('conversation');
  return public.send_message_v2(_conversation,_body,_kind,_attachment_id,_idem);
end
$function$;
grant execute on function public.send_message_guarded(uuid,text,text,uuid,text) to authenticated;

revoke execute on function public.issue_live_access(uuid) from authenticated;
create or replace function public.issue_live_access_guarded(_session uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $function$
declare result jsonb;
begin
  if exists(select 1 from public.call_sessions where id=_session) then
    perform public.assert_communication_privacy('call');
  end if;
  select public.issue_live_access(_session) into result;
  return result;
end
$function$;
grant execute on function public.issue_live_access_guarded(uuid) to authenticated;
