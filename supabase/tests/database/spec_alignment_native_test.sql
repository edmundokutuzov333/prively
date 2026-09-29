with checks as (
  select 'channels.province' as check_name, exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='channels' and column_name='province'
  ) as ok
  union all
  select 'profiles.province', exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='province'
  )
  union all
  select 'mutes.rls', coalesce((select relrowsecurity from pg_class where oid='public.mutes'::regclass), false)
  union all
  select 'mutes.mute_user', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='mute_user'
  )
  union all
  select 'mutes.unmute_user', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='unmute_user'
  )
  union all
  select 'hidden_from.hide_rpc', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='hide_creator_from_feed'
  )
  union all
  select 'support_tickets.rls', coalesce((select relrowsecurity from pg_class where oid='public.support_tickets'::regclass), false)
  union all
  select 'support.create', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='create_support_ticket'
  )
  union all
  select 'support.queue', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_support_queue'
  )
  union all
  select 'support.resolve', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='resolve_support_ticket'
  )
  union all
  select 'agency.function', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_agency_dashboard'
  )
  union all
  select 'referral.function', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='create_referral_code'
  )
  union all
  select 'wallet.non_negative', not exists (
    select 1 from public.wallets where balance < 0
  )
  union all
  select 'storage.private', not exists (
    select 1 from storage.buckets where public = true
  )
  union all
  select 'public.tables.rls', not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
  )
  union all
  select 'public.tables.policy', not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not exists (
      select 1 from pg_policy p where p.polrelid=c.oid
    )
  )
  union all
  select 'production.launch_disabled', coalesce((
    select value = false from public.platform_settings where key='production.launch_enabled'
  ), false)
)
select check_name, ok from checks order by check_name;
