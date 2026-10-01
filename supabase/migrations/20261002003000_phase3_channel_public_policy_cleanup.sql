-- FASE 3 follow-up: remove the legacy channel read policy that would bypass seed filtering.
-- Forward-only. Public discovery must use channel_select_public only.

DROP POLICY IF EXISTS channels_read ON public.channels;
DROP POLICY IF EXISTS channel_insert_creator ON public.channels;
DROP POLICY IF EXISTS channels_owner_write ON public.channels;
DROP POLICY IF EXISTS admin_manage_all ON public.channels;

REVOKE INSERT ON public.channels FROM public, anon, authenticated;
GRANT SELECT, UPDATE ON public.channels TO authenticated;
