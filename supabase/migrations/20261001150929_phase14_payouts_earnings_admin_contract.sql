-- Prively Fase 14: payout/read-model and admin storage contracts.
-- Reuses the existing certified financial and backup models. No duplicate tables.

create or replace function public.get_creator_earnings_summary()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'pending', coalesce((select balance from public.balances where owner_id=auth.uid() and account='creator_pending'),0),
    'available', coalesce((select balance from public.balances where owner_id=auth.uid() and account='creator_available'),0),
    'gross_earned', coalesce((
      select sum(amount)
      from public.ledger_entries
      where owner_id=auth.uid()
        and account='creator_pending'
        and amount > 0
    ),0),
    'requested_payouts', coalesce((
      select sum(amount)
      from public.payouts
      where owner_id=auth.uid()
        and status not in ('failed','rejected')
    ),0)
  );
$$;

revoke all on function public.get_creator_earnings_summary() from public, anon;
grant execute on function public.get_creator_earnings_summary() to authenticated;

create or replace function public.get_admin_storage_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  storage jsonb;
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'admin_required';
  end if;

  perform public.finance_require_aal2();

  select jsonb_build_object(
    'generated_at', now(),
    'b2', jsonb_build_object(
      'asset_count', coalesce((select count(*) from public.media_assets where storage_provider='backblaze_b2' and deleted_at is null),0),
      'registered_bytes', coalesce((select sum(file_size_bytes) from public.media_assets where storage_provider='backblaze_b2' and deleted_at is null),0)
    ),
    'streamtape', jsonb_build_object(
      'status_counts', coalesce((
        select jsonb_object_agg(coalesce(streamtape_status,'unknown'), status_count)
        from (
          select streamtape_status,count(*)::bigint as status_count
          from public.media_assets
          where deleted_at is null
          group by streamtape_status
        ) grouped
      ), '{}'::jsonb),
      'failed_over_one_hour', coalesce((
        select count(*)
        from public.media_assets
        where deleted_at is null
          and streamtape_status='failed'
          and streamtape_last_checked_at < now() - interval '1 hour'
      ),0)
    ),
    'backups', jsonb_build_object(
      'runs', coalesce((select count(*) from public.backup_runs),0),
      'last_success', (select max(completed_at) from public.backup_runs where status='succeeded'),
      'last_status', (select br.status from public.backup_runs br order by br.started_at desc limit 1),
      'cron_active', coalesce((
        select exists(
          select 1 from cron.job
          where jobname='prively-backup-db'
            and active
        )
      ),false)
    )
  ) into storage;

  perform public.phase8_audit(
    'admin_storage_status_viewed',
    'admin_storage',
    null,
    null,
    jsonb_build_object(
      'b2_assets', storage->'b2'->>'asset_count',
      'backup_runs', storage->'backups'->>'runs'
    )
  );

  return storage;
end
$$;

revoke all on function public.get_admin_storage_status() from public, anon;
grant execute on function public.get_admin_storage_status() to authenticated;

revoke insert, update, delete, truncate, references, trigger on public.payouts from public, anon, authenticated;
grant select on public.payouts to authenticated;
