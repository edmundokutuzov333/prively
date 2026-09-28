-- Phase 5 hardening: make retention configuration explicit without guessing a legal period
--
-- The policy document requires retention_days to be configurable and set by the
-- platform. Legal can set the value through platform_settings before launch.
-- Until then the archive remains retained without an assumed deletion date.

insert into public.platform_settings(key,value,updated_at)
values (
  'retention_days',
  jsonb_build_object(
    'days', null,
    'status', 'pending_legal_configuration'
  ),
  now()
)
on conflict (key) do nothing;
