-- =========================================================================
-- FASE 3: Hardening de Criação de Canal
-- 
-- Objetivo:
--   1. Adicionar RLS policy fail-closed para insert em channels
--   2. Marcar seed data com is_seed = true
--   3. Garantir que only creators com KYC podem criar canais
--   4. Excluir seed data de queries públicas
-- =========================================================================

-- ⚠️  Pré-requisito: Tabela channels deve ter coluna is_seed (default false)
-- Se não existe, descomentar:
-- ALTER TABLE public.channels ADD COLUMN is_seed boolean NOT NULL DEFAULT false;

-- RLS: Policy fail-closed para insert (creator owner with kyc)
DROP POLICY IF EXISTS channel_insert_creator on public.channels;
CREATE POLICY channel_insert_creator ON public.channels
  FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND public.has_role(auth.uid(), 'creator')
    AND public.is_age_verified(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.kyc_verifications 
      WHERE user_id = auth.uid() AND status = 'approved'
    )
  );

-- RLS: Policy fail-closed para select (non-seed, owner active)
DROP POLICY IF EXISTS channel_select_public on public.channels;
CREATE POLICY channel_select_public ON public.channels
  FOR SELECT
  USING (
    is_seed = false
    AND EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = owner_id AND p.status = 'active'
    )
  );

-- RLS: Policy para owner ler seu próprio canal (sem is_seed check)
DROP POLICY IF EXISTS channel_select_owner on public.channels;
CREATE POLICY channel_select_owner ON public.channels
  FOR SELECT
  USING (auth.uid() = owner_id);

-- RLS: Policy para owner editar seu próprio canal
DROP POLICY IF EXISTS channel_update_owner on public.channels;
CREATE POLICY channel_update_owner ON public.channels
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND public.has_role(auth.uid(), 'creator')
  );

-- Recriar função create_creator_channel com garantias de KYC
DROP FUNCTION IF EXISTS public.create_creator_channel(citext, text, text);
CREATE OR REPLACE FUNCTION public.create_creator_channel(
  _handle citext,
  _display_name text,
  _bio text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _channel_id uuid;
  _uid uuid := auth.uid();
BEGIN
  -- Validação 1: User logged in
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized: session_required';
  END IF;

  -- Validação 2: User has creator role
  IF NOT public.has_role(_uid, 'creator') THEN
    RAISE EXCEPTION 'forbidden: not_creator';
  END IF;

  -- Validação 3: User is age verified
  IF NOT public.is_age_verified(_uid) THEN
    RAISE EXCEPTION 'forbidden: age_not_verified';
  END IF;

  -- Validação 4: User has approved KYC (new guarantee)
  IF NOT EXISTS (
    SELECT 1 FROM public.kyc_verifications 
    WHERE user_id = _uid AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'forbidden: creator_kyc_required';
  END IF;

  -- Validação 5: Handle format
  IF _handle !~ '^[a-z0-9_]{3,24}$' THEN
    RAISE EXCEPTION 'invalid_input: invalid_channel_handle';
  END IF;

  -- Validação 6: Display name not empty
  IF COALESCE(NULLIF(TRIM(_display_name), ''), '') = '' THEN
    RAISE EXCEPTION 'invalid_input: display_name_required';
  END IF;

  -- Validação 7: Handle not taken
  IF EXISTS(SELECT 1 FROM public.channels WHERE handle = LOWER(_handle)) THEN
    RAISE EXCEPTION 'conflict: channel_handle_taken';
  END IF;

  -- Create channel
  INSERT INTO public.channels (
    owner_id, handle, display_name, bio, is_seed, created_at
  )
  VALUES (
    _uid,
    LOWER(TRIM(_handle)),
    TRIM(_display_name),
    NULLIF(TRIM(COALESCE(_bio, '')), ''),
    FALSE,
    NOW()
  )
  RETURNING id INTO _channel_id;

  -- Log security event
  INSERT INTO public.security_events (
    user_id, actor_id, event_type, metadata
  )
  VALUES (
    _uid,
    _uid,
    'channel.created',
    jsonb_build_object('channel_id', _channel_id, 'handle', _handle)
  );

  RETURN _channel_id;
END
$function$;

-- Grant execute only to authenticated users
REVOKE EXECUTE ON FUNCTION public.create_creator_channel(citext, text, text) FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.create_creator_channel(citext, text, text) TO authenticated;

-- =========================================================================
-- Utility function: Get creator's own channel (bypasses is_seed check)
-- =========================================================================
DROP FUNCTION IF EXISTS public.get_my_channel();
CREATE FUNCTION public.get_my_channel()
RETURNS TABLE (
  id uuid,
  handle citext,
  display_name text,
  bio text,
  owner_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT id, handle, display_name, bio, owner_id
  FROM public.channels
  WHERE owner_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_channel() FROM PUBLIC, ANON;
GRANT EXECUTE ON FUNCTION public.get_my_channel() TO authenticated;

-- =========================================================================
-- Utility function: Get public channels (excludes is_seed)
-- =========================================================================
DROP FUNCTION IF EXISTS public.get_public_channels(text);
CREATE FUNCTION public.get_public_channels(_query text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  handle citext,
  display_name text,
  bio text,
  owner_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT c.id, c.handle, c.display_name, c.bio, c.owner_id
  FROM public.channels c
  JOIN public.profiles p ON p.id = c.owner_id
  WHERE c.is_seed = FALSE
    AND p.status = 'active'
    AND (_query IS NULL OR c.handle ILIKE '%' || _query || '%')
  ORDER BY c.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_channels(text) TO PUBLIC, AUTHENTICATED, ANON;

-- =========================================================================
-- Comment for audit trail
-- =========================================================================
COMMENT ON COLUMN public.channels.is_seed IS
  'Development/test marker. is_seed=true channels are excluded from public queries.
   Use supabase/seed/dev.sql for fixtures, mark with is_seed=true here.';
