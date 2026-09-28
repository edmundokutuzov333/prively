begin;

select plan(13);

select ok(
  exists(select 1 from storage.buckets where id='prively-private' and public=false),
  'private media bucket remains private'
);

select ok(
  exists(select 1 from storage.buckets where id='compliance-archive' and public=false),
  'compliance archive bucket is private'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.compliance_objects'::regclass),
  'compliance objects RLS enabled'
);

select ok(
  to_regclass('public.compliance_objects') is not null,
  'compliance objects table exists'
);

select ok(
  to_regclass('public.media_access_logs') is not null,
  'media access log table exists'
);

select ok(
  (select is_nullable='YES'
   from information_schema.columns
   where table_schema='public'
     and table_name='media_assets'
     and column_name='sha256'),
  'server SHA-256 remains nullable until integrity processing'
);

select ok(
  (select is_nullable='YES'
   from information_schema.columns
   where table_schema='public'
     and table_name='media_uploads'
     and column_name='expected_sha256'),
  'client SHA is optional for large resumable uploads'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_media_upload(uuid,text,text,bigint,text,text)',
    'EXECUTE'
  ),
  'authenticated creators can initiate media uploads through the RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.archive_media_event(uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated users cannot execute compliance archive mutation directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.finalize_media_upload(uuid,text,bigint)',
    'EXECUTE'
  ),
  'anonymous users cannot finalize uploads'
);

select ok(
  exists(
    select 1
    from pg_constraint
    where conrelid='public.media_access_logs'::regclass
      and pg_get_constraintdef(oid) like '%processing%'
  ),
  'processing reads are accepted by the media access audit contract'
);

select ok(
  not exists(
    select 1
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname='media_processing_jobs'
      and t.tgname='trg_dispatch_media_job'
      and not t.tgisinternal
  ),
  'unverified automatic media dispatcher is not active'
);

select ok(
  not exists(
    select 1
    from cron.job
    where jobname='prively-process-media-sweep'
  ),
  'unverified media sweep cron is not active'
);

select * from finish();
rollback;