-- FASE 3: final channel policy and authorization hardening.
-- Forward-only; channel creation is RPC-only.

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS channels_owner_write ON public.channels;
DROP POLICY IF EXISTS admin_manage_all ON public.channels;
DROP POLICY IF EXISTS channel_insert_creator ON public.channels;
DROP POLICY IF EXISTS channel_select_public ON public.channels;
DROP POLICY IF EXISTS channel_select_owner ON public.channels;
DROP POLICY IF EXISTS channel_update_owner ON public.channels;
DROP POLICY IF EXISTS channel_admin_update ON public.channels;
DROP POLICY IF EXISTS channel_admin_delete ON public.channels;

CREATE POLICY channel_select_public ON public.channels
  FOR SELECT TO authenticated
  USING (
    is_seed = false
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = owner_id AND p.status = 'active'
    )
  );

CREATE POLICY channel_select_owner ON public.channels
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);

CREATE POLICY channel_update_owner ON public.channels
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id AND public.has_role((select auth.uid()), 'creator'));

CREATE POLICY channel_admin_update ON public.channels
  FOR UPDATE TO authenticated
  USING ((select private.is_platform_admin()) = true)
  WITH CHECK ((select private.is_platform_admin()) = true);

CREATE POLICY channel_admin_delete ON public.channels
  FOR DELETE TO authenticated
  USING ((select private.is_platform_admin()) = true);

REVOKE INSERT ON public.channels FROM authenticated;
GRANT SELECT, UPDATE ON public.channels TO authenticated;

CREATE OR REPLACE FUNCTION public.create_creator_channel(
  _handle text,
  _display_name text,
  _bio text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  channel_id uuid := gen_random_uuid();
  normalized_handle citext := lower(trim(_handle));
  current_user_id uuid := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_role(current_user_id, 'creator') THEN RAISE EXCEPTION 'not_creator'; END IF;
  IF NOT public.has_current_creator_terms(current_user_id) THEN RAISE EXCEPTION 'creator_terms_required'; END IF;
  IF NOT public.is_age_verified(current_user_id) THEN RAISE EXCEPTION 'age_not_verified'; END IF;
  IF normalized_handle IS NULL OR normalized_handle !~ '^[a-z0-9_]{3,24}$' THEN RAISE EXCEPTION 'invalid_channel_handle'; END IF;
  IF char_length(trim(coalesce(_display_name, ''))) NOT BETWEEN 2 AND 60 THEN RAISE EXCEPTION 'display_name_invalid'; END IF;
  IF _bio IS NOT NULL AND char_length(_bio) > 500 THEN RAISE EXCEPTION 'bio_too_long'; END IF;
  IF EXISTS (SELECT 1 FROM public.channels c WHERE c.handle = normalized_handle) THEN RAISE EXCEPTION 'channel_handle_taken'; END IF;

  INSERT INTO public.channels (id, owner_id, handle, display_name, bio, is_seed)
  VALUES (channel_id, current_user_id, normalized_handle, trim(_display_name), nullif(trim(_bio), ''), false);

  IF to_regclass('public.security_events') IS NOT NULL THEN
    INSERT INTO public.security_events (user_id, actor_id, event_type, metadata)
    VALUES (current_user_id, current_user_id, 'channel.created', jsonb_build_object('channel_id', channel_id, 'handle', normalized_handle));
  END IF;
  RETURN channel_id;
END
$function$;

REVOKE ALL ON FUNCTION public.create_creator_channel(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_creator_channel(text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_channel_handle(_handle text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE normalized_handle citext := lower(trim(_handle));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF normalized_handle IS NULL OR normalized_handle !~ '^[a-z0-9_]{3,24}$' THEN RETURN false; END IF;
  RETURN NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.handle = normalized_handle);
END
$function$;
REVOKE ALL ON FUNCTION public.check_channel_handle(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_channel_handle(text) TO authenticated;
COMMENT ON COLUMN public.channels.is_seed IS 'Development/test marker. Seed channels are excluded from public discovery.';
