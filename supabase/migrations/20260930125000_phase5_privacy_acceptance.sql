create table if not exists public.communication_privacy_acceptances(
  user_id uuid not null references public.profiles on delete cascade,
  surface text not null check(surface in ('conversation','call')),
  version text not null,
  accepted_at timestamptz not null default now(),
  primary key(user_id,surface,version)
);
alter table public.communication_privacy_acceptances enable row level security;
create policy communication_privacy_own on public.communication_privacy_acceptances for select to authenticated using(user_id=auth.uid());
revoke insert,update,delete on public.communication_privacy_acceptances from anon,authenticated;

create or replace function public.accept_communication_privacy(_surface text,_version text)
returns void language plpgsql security definer set search_path=public as $function$
begin
  if auth.uid() is null or _surface not in ('conversation','call') or nullif(trim(_version),'') is null then raise exception 'invalid_privacy_acceptance'; end if;
  insert into public.communication_privacy_acceptances(user_id,surface,version) values(auth.uid(),_surface,trim(_version)) on conflict do nothing;
  insert into public.security_events(user_id,actor_id,event_type,metadata) values(auth.uid(),auth.uid(),'communication.privacy.accepted',jsonb_build_object('surface',_surface,'version',_version));
end
$function$;
grant execute on function public.accept_communication_privacy(text,text) to authenticated;
