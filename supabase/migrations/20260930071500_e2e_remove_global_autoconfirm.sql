-- Phase E2E: restore real email-confirmation semantics.
-- The previous autoconfirm trigger defeated the configured Auth confirmation
-- contract by marking every new user confirmed before the email flow.
drop trigger if exists prively_autoconfirm_email on auth.users;
drop function if exists public.prively_autoconfirm_email();
