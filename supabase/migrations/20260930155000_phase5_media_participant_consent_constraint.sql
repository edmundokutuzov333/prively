-- Align media consent storage with the secure upload contract.
alter table public.media_consents
  drop constraint if exists media_consents_consent_type_check;

alter table public.media_consents
  add constraint media_consents_consent_type_check
  check (consent_type = any (array['upload'::text,'rights'::text,'participants'::text,'watermark'::text]));
