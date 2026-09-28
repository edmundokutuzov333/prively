begin;
select plan(1);
select ok(
  not exists(
    select 1
    from pg_policies
    where schemaname='storage'
      and tablename='objects'
      and policyname in ('prively_private_admin_read','prively_private_media_admin_read')
  ),
  'admin cannot bypass media access audit through direct storage read'
);
select * from finish();
rollback;