create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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

  insert into public.user_roles(user_id,role)
  values(new.id,'client')
  on conflict do nothing;

  if role_to_grant='creator' then
    insert into public.user_roles(user_id,role)
    values(new.id,'creator')
    on conflict do nothing;
  end if;

  insert into public.balances(owner_id,account,balance)
  values
    (new.id,'wallet',0),
    (new.id,'creator_pending',0),
    (new.id,'creator_available',0)
  on conflict(owner_id,account) do nothing;

  if lower(coalesce(new.raw_user_meta_data->>'age_confirmed','false')) = 'true' then
    insert into public.consent_records(user_id,consent_type,version,consented_at,source,metadata)
    values(new.id,'age_gate','1.0',now(),'registration',jsonb_build_object('email_confirmed_required',true))
    on conflict do nothing;
  end if;

  if jsonb_typeof(legal->'terms')='object' then
    insert into public.legal_acceptances(user_id,document_type,version,source,content_hash,metadata)
    values(new.id,'terms',coalesce(legal->'terms'->>'version','1.0'),'registration',legal->'terms'->>'content_hash',jsonb_build_object('email_confirmed_required',true));
  end if;

  if jsonb_typeof(legal->'privacy')='object' then
    insert into public.legal_acceptances(user_id,document_type,version,source,content_hash,metadata)
    values(new.id,'privacy',coalesce(legal->'privacy'->>'version','1.0'),'registration',legal->'privacy'->>'content_hash',jsonb_build_object('email_confirmed_required',true));
  end if;

  if role_to_grant='creator' and jsonb_typeof(legal->'creator_terms')='object' then
    creator_version := coalesce(
      legal->'creator_terms'->>'version',
      (select value#>>'{}' from public.platform_settings where key='legal.creator_terms_version')
    );
    declaration_data := coalesce(legal->'creator_terms'->'declarations','{}'::jsonb);
    insert into public.creator_terms_acceptances(user_id,version,source,declarations,content_hash,metadata)
    values(
      new.id,
      creator_version,
      'registration',
      declaration_data,
      legal->'creator_terms'->>'content_hash',
      jsonb_build_object('email_confirmed_required',true)
    )
    on conflict(user_id,version) do nothing;
  end if;

  return new;
end
$function$;
