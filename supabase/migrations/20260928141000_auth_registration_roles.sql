create or replace function public.prively_autoconfirm_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  new.confirmation_token := '';
  new.confirmation_sent_at := null;
  new.recovery_token := coalesce(new.recovery_token, '');
  new.email_change := coalesce(new.email_change, '');
  new.email_change_token_new := coalesce(new.email_change_token_new, '');
  return new;
end
$$;

drop trigger if exists prively_autoconfirm_email on auth.users;
create trigger prively_autoconfirm_email
before insert on auth.users
for each row execute function public.prively_autoconfirm_email();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h text;
  signup_role text;
begin
  h := lower(trim(coalesce(new.raw_user_meta_data->>'handle','')));
  if h !~ '^[a-z0-9_]{3,24}$' then
    h := 'priv_' || replace(left(new.id::text,18),'-','');
  end if;

  insert into public.profiles(id,handle,display_name)
  values(new.id,h,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),h))
  on conflict(id) do nothing;

  insert into public.user_roles(user_id,role)
  values(new.id,'client')
  on conflict do nothing;

  signup_role := lower(coalesce(new.raw_user_meta_data->>'signup_role','client'));
  if signup_role = 'creator' then
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

  return new;
end
$$;
