-- FASE 3 follow-up: reconcile the first hardening migration with the
-- repository's existing channels schema and create_creator_channel(text, ...).
-- This migration is forward-only and safe to run whether the previous draft
-- migration was applied or not.

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT false;

-- Remove the draft overload if it was applied. The application contract uses
-- text, matching the existing function from phase 5/creator terms.
DROP FUNCTION IF EXISTS public.create_creator_channel(citext, text, text);

DROP POLICY IF EXISTS channel_insert_creator ON public.channels;
CREATE POLICY channel_insert_creator ON public.channels
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = owner_id
    AND public.has_role((select auth.uid()), 'creator')
    AND public.is_age_verified((select auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.kyc_verifications k
      WHERE k.user_id = (select auth.uid())
        AND k.status = 'approved'
    )
  );

DROP POLICY IF EXISTS channel_select_public ON public.channels;
CREATE POLICY channel_select_public ON public.channels
  FOR SELECT TO authenticated
  USING (
    is_seed = false
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = owner_id AND p.status = 'active'
    )
  );

DROP POLICY IF EXISTS channel_select_owner ON public.channels;
CREATE POLICY channel_select_owner ON public.channels
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);

DROP POLICY IF EXISTS channel_update_owner ON public.channels;
CREATE POLICY channel_update_owner ON public.channels
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK (
    (select auth.uid()) = owner_id
    AND public.has_role((select auth.uid()), 'creator')
  );

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
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT public.has_role(current_user_id, 'creator') THEN
    RAISE EXCEPTION 'not_creator';
  END IF;

  IF NOT public.is_age_verified(current_user_id) THEN
    RAISE EXCEPTION 'age_not_verified';
  END IF;

  IF NOT public.has_current_creator_terms(current_user_id) THEN
    RAISE EXCEPTION 'creator_terms_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.kyc_verifications k
    WHERE k.user_id = current_user_id AND k.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'creator_kyc_required';
  END IF;

  IF normalized_handle IS NULL OR normalized_handle !~ '^[a-z0-9_]{3,24}$' THEN
    RAISE EXCEPTION 'invalid_channel_handle';
  END IF;

  IF char_length(trim(coalesce(_display_name, ''))) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'display_name_invalid';
  END IF;

  IF _bio IS NOT NULL AND char_length(_bio) > 500 THEN
    RAISE EXCEPTION 'bio_too_long';
  END IF;

  IF EXISTS (SELECT 1 FROM public.channels c WHERE c.handle = normalized_handle) THEN
    RAISE EXCEPTION 'channel_handle_taken';
  END IF;

  INSERT INTO public.channels (id, owner_id, handle, display_name, bio, is_seed)
  VALUES (
    channel_id,
    current_user_id,
    normalized_handle,
    trim(_display_name),
    nullif(trim(_bio), ''),
    false
  );

  IF to_regclass('public.security_events') IS NOT NULL THEN
    INSERT INTO public.security_events (user_id, actor_id, event_type, metadata)
    VALUES (
      current_user_id,
      current_user_id,
      'channel.created',
      jsonb_build_object('channel_id', channel_id, 'handle', normalized_handle)
    );
  END IF;

  RETURN channel_id;
END
$function$;

REVOKE ALL ON FUNCTION public.create_creator_channel(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_creator_channel(text, text, text) TO authenticated;

COMMENT ON COLUMN public.channels.is_seed IS
  'Development/test marker. Seed channels are excluded from public discovery.';
