alter table public.push_subscriptions add column if not exists preferences jsonb not null default '{"messages":true,"lives":true,"news":true,"money":true}'::jsonb;
alter table public.push_subscriptions add column if not exists quiet_start time;
alter table public.push_subscriptions add column if not exists quiet_end time;
alter table public.push_subscriptions add column if not exists discreet_mode boolean not null default false;
insert into public.platform_settings(key,value) values('feature_flags.live','false'::jsonb),('feature_flags.translation','false'::jsonb),('feature_flags.push','false'::jsonb),('feature_flags.ai_response_assistant','false'::jsonb) on conflict(key) do nothing;
