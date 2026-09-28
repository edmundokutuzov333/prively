create schema if not exists private;

create table if not exists public.role_permissions(role public.app_role not null,permission text not null,created_at timestamptz not null default now(),primary key(role,permission));
create table if not exists public.consent_records(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles on delete cascade,
 consent_type text not null check(consent_type in ('age_gate','privacy','marketing','safety')),
 version text not null, consented_at timestamptz not null default now(), source text not null default 'web',
 ip_hash text,user_agent_hash text,metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.legal_acceptances(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles on delete cascade,
 document_type text not null check(document_type in ('terms','privacy','content_prohibited','refunds','cookies','dmca')),
 version text not null,accepted_at timestamptz not null default now(),source text not null default 'web',
 ip_hash text,user_agent_hash text,metadata jsonb not null default '{}'::jsonb,
 unique(user_id,document_type,version)
);
create table if not exists public.auth_sessions(
 session_id uuid primary key,user_id uuid not null references public.profiles on delete cascade,
 user_agent_hash text,ip_hash text,device_label text,
 first_seen_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),revoked_at timestamptz
);
create table if not exists public.trusted_devices(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,
 session_id uuid not null references public.auth_sessions(session_id) on delete cascade,
 device_label text not null check(char_length(trim(device_label)) between 1 and 80),
 user_agent_hash text,created_at timestamptz not null default now(),last_seen_at timestamptz not null default now(),
 revoked_at timestamptz,unique(user_id,session_id)
);
create table if not exists public.account_state_events(
 id bigint generated always as identity primary key,user_id uuid not null references public.profiles on delete cascade,
 from_status text,to_status text not null check(to_status in ('pending','active','suspended','banned')),
 reason text,actor_id uuid references public.profiles,created_at timestamptz not null default now()
);
create table if not exists public.self_exclusions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,
 starts_at timestamptz not null default now(),ends_at timestamptz not null,reason text,requested_at timestamptz not null default now(),
 unique(user_id,starts_at)
);
create table if not exists public.security_events(
 id bigint generated always as identity primary key,user_id uuid references public.profiles on delete set null,
 actor_id uuid references public.profiles on delete set null,event_type text not null,metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create or replace function public.has_permission(_uid uuid,_permission text)
returns boolean language plpgsql stable security definer set search_path=public as $$
begin
 if _uid is null or _permission is null then return false; end if;
 if auth.uid() is not null and _uid<>auth.uid() then return false; end if;
 if _permission like 'admin.%' and coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then return false; end if;
 return exists(select 1 from public.user_roles ur join public.role_permissions rp on rp.role=ur.role where ur.user_id=_uid and rp.permission=_permission);
end $$;

create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select public.has_permission(auth.uid(),'admin.control_room'); $$;

create or replace function public.record_consent(_consent_type text,_version text,_source text default 'web',_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid:=gen_random_uuid();
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if _consent_type not in ('age_gate','privacy','marketing','safety') then raise exception 'invalid_consent_type'; end if;
 if nullif(trim(_version),'') is null then raise exception 'consent_version_required'; end if;
 insert into public.consent_records(id,user_id,consent_type,version,source,metadata)
 values(id,auth.uid(),trim(_consent_type),trim(_version),coalesce(nullif(trim(_source),''),'web'),coalesce(_metadata,'{}'::jsonb));
 insert into public.security_events(user_id,actor_id,event_type,metadata)
 values(auth.uid(),auth.uid(),'consent.recorded',jsonb_build_object('type',_consent_type,'version',_version));
 return id;
end $$;

create or replace function public.record_legal_acceptance(_document_type text,_version text,_source text default 'web',_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid;
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if _document_type not in ('terms','privacy','content_prohibited','refunds','cookies','dmca') then raise exception 'invalid_document_type'; end if;
 if nullif(trim(_version),'') is null then raise exception 'document_version_required'; end if;
 insert into public.legal_acceptances(user_id,document_type,version,source,metadata)
 values(auth.uid(),trim(_document_type),trim(_version),coalesce(nullif(trim(_source),''),'web'),coalesce(_metadata,'{}'::jsonb))
 on conflict(user_id,document_type,version) do nothing returning id into id;
 if id is null then select la.id into id from public.legal_acceptances la where la.user_id=auth.uid() and la.document_type=_document_type and la.version=_version; end if;
 insert into public.security_events(user_id,actor_id,event_type,metadata)
 values(auth.uid(),auth.uid(),'legal.accepted',jsonb_build_object('document',_document_type,'version',_version));
 return id;
end $$;

create or replace function public.has_legal_acceptance(_uid uuid,_document_type text,_version text)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.legal_acceptances where user_id=_uid and document_type=_document_type and version=_version); $$;

create or replace function public.register_current_session(_device_label text default null,_user_agent_hash text default null,_ip_hash text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
begin
 if auth.uid() is null or sid is null then raise exception 'session_missing'; end if;
 insert into public.auth_sessions(session_id,user_id,user_agent_hash,ip_hash,device_label)
 values(sid,auth.uid(),nullif(trim(_user_agent_hash),''),nullif(trim(_ip_hash),''),nullif(trim(_device_label),''))
 on conflict(session_id) do update set last_seen_at=now(),device_label=coalesce(excluded.device_label,public.auth_sessions.device_label);
 insert into public.security_events(user_id,actor_id,event_type,metadata)
 values(auth.uid(),auth.uid(),'auth.session_registered',jsonb_build_object('session_id',sid,'device_label',_device_label));
 return sid;
end $$;

create or replace function public.list_current_sessions()
returns table(session_id uuid,device_label text,first_seen_at timestamptz,last_seen_at timestamptz,revoked_at timestamptz,trusted boolean,current_session boolean)
language sql stable security definer set search_path=public as $$
select s.session_id,s.device_label,s.first_seen_at,s.last_seen_at,s.revoked_at,
 exists(select 1 from public.trusted_devices d where d.session_id=s.session_id and d.revoked_at is null),
 s.session_id=nullif(auth.jwt()->>'session_id','')::uuid
from public.auth_sessions s where s.user_id=auth.uid() order by s.last_seen_at desc
$$;

create or replace function public.trust_current_device(_device_label text)
returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid; did uuid;
begin
 if auth.uid() is null or sid is null then raise exception 'session_missing'; end if;
 if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'mfa_required'; end if;
 if not exists(select 1 from public.auth_sessions where session_id=sid and user_id=auth.uid()) then perform public.register_current_session(_device_label,null,null); end if;
 insert into public.trusted_devices(user_id,session_id,device_label,user_agent_hash)
 select auth.uid(),sid,trim(_device_label),s.user_agent_hash from public.auth_sessions s where s.session_id=sid
 on conflict(user_id,session_id) do update set device_label=excluded.device_label,last_seen_at=now(),revoked_at=null
 returning id into did;
 insert into public.security_events(user_id,actor_id,event_type,metadata)
 values(auth.uid(),auth.uid(),'security.device_trusted',jsonb_build_object('device_id',did));
 return did;
end $$;

create or replace function public.revoke_trusted_device(_device_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.trusted_devices set revoked_at=now() where id=_device_id and user_id=auth.uid();
 if not found then raise exception 'device_not_found'; end if;
 insert into public.security_events(user_id,actor_id,event_type,metadata)
 values(auth.uid(),auth.uid(),'security.device_revoked',jsonb_build_object('device_id',_device_id));
end $$;

create or replace function public.start_self_exclusion(_until timestamptz,_reason text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid:=gen_random_uuid();
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if _until<=now() then raise exception 'invalid_self_exclusion_period'; end if;
 insert into public.self_exclusions(id,user_id,starts_at,ends_at,reason) values(id,auth.uid(),now(),_until,nullif(trim(_reason),''));
 perform set_config('app.internal_write','on',true);
 update public.profiles set self_excluded_until=_until where id=auth.uid();
 insert into public.security_events(user_id,actor_id,event_type,metadata)
 values(auth.uid(),auth.uid(),'account.self_exclusion_started',jsonb_build_object('until',_until));
 return id;
end $$;

create or replace function public.set_account_state(_user_id uuid,_status text,_reason text default null)
returns void language plpgsql security definer set search_path=public as $$
declare old_status text;
begin
 if not public.has_permission(auth.uid(),'admin.users') then raise exception 'forbidden'; end if;
 if _user_id=auth.uid() then raise exception 'self_admin_state_change_forbidden'; end if;
 if _status not in ('pending','active','suspended','banned') then raise exception 'invalid_account_state'; end if;
 select status into old_status from public.profiles where id=_user_id for update;
 if old_status is null then raise exception 'user_not_found'; end if;
 perform set_config('app.internal_write','on',true);
 update public.profiles set status=_status where id=_user_id;
 insert into public.account_state_events(user_id,from_status,to_status,reason,actor_id)
 values(_user_id,old_status,_status,nullif(trim(_reason),''),auth.uid());
 insert into public.security_events(user_id,actor_id,event_type,metadata)
 values(_user_id,auth.uid(),'account.state_changed',jsonb_build_object('from',old_status,'to',_status,'reason',_reason));
end $$;

create or replace function public.submit_kyc(_doc_path text,_selfie_path text,_provider text default 'manual')
returns uuid language plpgsql security definer set search_path=public as $$
declare id uuid:=gen_random_uuid();
begin
 if auth.uid() is null then raise exception 'unauthorized'; end if;
 if nullif(trim(_doc_path),'') is null or nullif(trim(_selfie_path),'') is null then raise exception 'kyc_documents_required'; end if;
 if split_part(_doc_path,'/',1)<>auth.uid()::text or split_part(_selfie_path,'/',1)<>auth.uid()::text then raise exception 'kyc_path_forbidden'; end if;
 insert into public.kyc_verifications(id,user_id,provider,status,doc_path,selfie_path)
 values(id,auth.uid(),coalesce(nullif(trim(_provider),''),'manual'),'pending',trim(_doc_path),trim(_selfie_path));
 insert into public.security_events(user_id,actor_id,event_type,metadata)
 values(auth.uid(),auth.uid(),'kyc.submitted',jsonb_build_object('kyc_id',id));
 return id;
end $$;

create or replace function public.get_security_overview()
returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object(
 'aal',coalesce(auth.jwt()->>'aal','aal1'),
 'session_id',nullif(auth.jwt()->>'session_id',''),
 'mfa_enrolled',exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified'),
 'kyc_status',(select status from public.kyc_verifications where user_id=auth.uid() order by created_at desc limit 1),
 'account_status',(select status from public.profiles where id=auth.uid()),
 'self_excluded_until',(select self_excluded_until from public.profiles where id=auth.uid()),
 'required_terms_accepted',public.has_legal_acceptance(auth.uid(),'terms','1.0'),
 'required_privacy_accepted',public.has_legal_acceptance(auth.uid(),'privacy','1.0')
) $$;

create or replace function public.get_admin_security_audit(_limit integer default 100)
returns table(id bigint,user_id uuid,actor_id uuid,event_type text,metadata jsonb,created_at timestamptz)
language sql stable security definer set search_path=public as $$
select e.id,e.user_id,e.actor_id,e.event_type,e.metadata,e.created_at
from public.security_events e where public.has_permission(auth.uid(),'admin.audit')
order by e.created_at desc limit greatest(1,least(coalesce(_limit,100),500))
$$;

insert into public.role_permissions(role,permission)
select v.role::public.app_role,v.permission from (values
('client','security.profile.read'),('client','security.profile.update'),('client','security.legal.accept'),('client','security.self_exclude'),('client','security.sessions.read'),('client','security.sessions.revoke'),('client','security.device.manage'),('client','security.mfa.manage'),('client','security.kyc.submit'),
('creator','security.profile.read'),('creator','security.profile.update'),('creator','security.legal.accept'),('creator','security.self_exclude'),('creator','security.sessions.read'),('creator','security.sessions.revoke'),('creator','security.device.manage'),('creator','security.mfa.manage'),('creator','security.kyc.submit'),
('agency','security.profile.read'),('agency','security.profile.update'),('agency','security.sessions.read'),('agency','security.device.manage'),
('moderator','admin.moderation'),('moderator','admin.audit'),('support','admin.support'),('support','admin.audit'),('finance','admin.finance'),('finance','admin.audit'),('compliance','admin.kyc'),('compliance','admin.compliance'),('compliance','admin.audit'),
('admin','admin.control_room'),('admin','admin.users'),('admin','admin.kyc'),('admin','admin.moderation'),('admin','admin.finance'),('admin','admin.compliance'),('admin','admin.audit'),('admin','admin.config'),('admin','admin.security')
) as v(role,permission) on conflict do nothing;

grant execute on function public.has_permission(uuid,text) to authenticated;
grant execute on function public.record_consent(text,text,text,jsonb) to authenticated;
grant execute on function public.record_legal_acceptance(text,text,text,jsonb) to authenticated;
grant execute on function public.has_legal_acceptance(uuid,text,text) to authenticated;
grant execute on function public.register_current_session(text,text,text) to authenticated;
grant execute on function public.list_current_sessions() to authenticated;
grant execute on function public.trust_current_device(text) to authenticated;
grant execute on function public.revoke_trusted_device(uuid) to authenticated;
grant execute on function public.start_self_exclusion(timestamptz,text) to authenticated;
grant execute on function public.set_account_state(uuid,text,text) to authenticated;
grant execute on function public.submit_kyc(text,text,text) to authenticated;
grant execute on function public.get_security_overview() to authenticated;
grant execute on function public.get_admin_security_audit(integer) to authenticated;
revoke execute on function public.has_permission(uuid,text) from anon;
