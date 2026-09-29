-- Phase 6: configurable hourly FX refresh worker
-- No exchange rate is fabricated when a provider is not configured.

insert into public.platform_settings(key,value,updated_at)
values (
  'fx_rates.config',
  '{"url":null,"base":"MZN","quotes":["USD","EUR","ZAR"],"source":"pending_configuration"}'::jsonb,
  now()
)
on conflict(key) do nothing;

do $$
begin
  if not exists (select 1 from vault.secrets where name='prively_fx_job_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'prively_fx_job_token');
  end if;
end
$$;

grant execute on function public.financial_secret(text) to service_role;

do $$
begin
  begin
    perform cron.unschedule('prively-fx-refresh-hourly');
  exception when others then null;
  end;

  perform cron.schedule(
    'prively-fx-refresh-hourly',
    '10 * * * *',
    $cmd$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name='prively_project_url') || '/functions/v1/fx-refresh',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-prively-job-token',(select decrypted_secret from vault.decrypted_secrets where name='prively_fx_job_token')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      ) as request_id;
    $cmd$
  );
end
$$;
