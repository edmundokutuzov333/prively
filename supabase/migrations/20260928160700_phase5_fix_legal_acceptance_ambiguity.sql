create or replace function public.record_legal_acceptance(
  _document_type text,
  _version text,
  _source text default 'web',
  _metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare acceptance_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if _document_type not in ('terms','privacy','content_prohibited','refunds','cookies','dmca') then raise exception 'invalid_document_type'; end if;
  if nullif(trim(_version),'') is null then raise exception 'document_version_required'; end if;

  insert into public.legal_acceptances(user_id,document_type,version,source,metadata)
  values(auth.uid(),trim(_document_type),trim(_version),coalesce(nullif(trim(_source),''),'web'),coalesce(_metadata,'{}'::jsonb))
  on conflict(user_id,document_type,version) do nothing
  returning legal_acceptances.id into acceptance_id;

  if acceptance_id is null then
    select la.id
    into acceptance_id
    from public.legal_acceptances la
    where la.user_id=auth.uid()
      and la.document_type=trim(_document_type)
      and la.version=trim(_version);
  end if;

  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(auth.uid(),auth.uid(),'legal.accepted',jsonb_build_object('document',_document_type,'version',_version));
  return acceptance_id;
end
$$;

grant execute on function public.record_legal_acceptance(text,text,text,jsonb) to authenticated;