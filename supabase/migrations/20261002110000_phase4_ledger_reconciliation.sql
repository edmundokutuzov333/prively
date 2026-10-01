-- Phase 4 Reconciliation: Forward-only migration
-- Corrects ledger append-only enforcement and integrates with existing financial schema
-- 
-- Issues resolved:
-- 1. Trigger trg_ledger_blocked removed (conflicted with SECURITY DEFINER functions)
-- 2. Grants-based access control (not auth.uid() triggers)
-- 3. IF NOT EXISTS for idempotent re-runs
-- 4. Validates sum-zero constraint per txn_id
-- 5. Preserves existing ledger_entries, balances, and ledger_account type
-- 6. Integrates with Phase 6+ financial functions

DO $$
DECLARE
BEGIN
  -- Step 1: Check if ledger_entries exists and has minimal required columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='ledger_entries'
  ) THEN
    -- Create ledger_entries if missing (shouldn't happen, but safe)
    CREATE TABLE public.ledger_entries (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      txn_id uuid NOT NULL DEFAULT gen_random_uuid(),
      account public.ledger_account NOT NULL,
      owner_id uuid NOT NULL REFERENCES public.profiles ON DELETE RESTRICT,
      amount bigint NOT NULL,
      kind text NOT NULL,
      ref_type text,
      ref_id uuid,
      release_at timestamptz,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT amount_not_zero CHECK (amount <> 0),
      CONSTRAINT valid_ref_type CHECK (
        ref_type IS NULL OR ref_type IN ('purchase','topup','payout','subscription','adjustment','test','badge','premium','escrow_hold','commission')
      )
    );
    CREATE INDEX idx_ledger_owner_created ON public.ledger_entries(owner_id, created_at DESC);
    CREATE INDEX idx_ledger_txn_id ON public.ledger_entries(txn_id);
    CREATE INDEX idx_ledger_ref ON public.ledger_entries(ref_type, ref_id) WHERE ref_id IS NOT NULL;
    CREATE INDEX idx_ledger_metadata_channel ON public.ledger_entries((metadata->>'channel_id'), created_at DESC)
      WHERE metadata ? 'channel_id';
  END IF;

  -- Step 2: Ensure ledger_entries has metadata column (Phase 6 requirement)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ledger_entries' AND column_name='metadata'
  ) THEN
    ALTER TABLE public.ledger_entries ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  -- Step 3: Remove incorrect blocking trigger if it exists
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_ledger_blocked' AND tgrelid='public.ledger_entries'::regclass) THEN
    DROP TRIGGER IF EXISTS trg_ledger_blocked ON public.ledger_entries;
    DROP FUNCTION IF EXISTS public.ledger_insert_blocked();
  END IF;
END $$;

-- Step 4: Ensure immutability trigger exists and works correctly
CREATE OR REPLACE FUNCTION public.ledger_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ledger_is_append_only';
END
$function$;

DROP TRIGGER IF EXISTS trg_ledger_no_upd ON public.ledger_entries;
CREATE TRIGGER trg_ledger_no_upd
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.ledger_immutable();

-- Step 5: Validate sum-zero constraint per transaction
CREATE OR REPLACE FUNCTION public.assert_ledger_txn_balanced()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  entry_count bigint;
  total bigint;
BEGIN
  SELECT count(*), COALESCE(sum(amount), 0)
  INTO entry_count, total
  FROM public.ledger_entries
  WHERE txn_id = NEW.txn_id;

  IF entry_count < 2 OR total <> 0 THEN
    RAISE EXCEPTION 'unbalanced_ledger_transaction:%', NEW.txn_id;
  END IF;

  RETURN NULL;
END
$function$;

DROP TRIGGER IF EXISTS trg_assert_ledger_balanced ON public.ledger_entries;
CREATE CONSTRAINT TRIGGER trg_assert_ledger_balanced
  AFTER INSERT ON public.ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_ledger_txn_balanced();

-- Step 6: Ensure balances table exists and is correctly configured
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='balances'
  ) THEN
    CREATE TABLE public.balances (
      owner_id uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
      account public.ledger_account NOT NULL,
      balance bigint NOT NULL DEFAULT 0,
      PRIMARY KEY (owner_id, account),
      CONSTRAINT wallet_non_negative CHECK (account <> 'wallet' OR balance >= 0)
    );
    CREATE INDEX idx_balances_owner ON public.balances(owner_id);
  END IF;
END $$;

-- Step 7: Ensure both tables have RLS enabled
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;

-- Step 8: Create/update RLS policies for ledger_entries
DROP POLICY IF EXISTS ledger_owner_read ON public.ledger_entries;
CREATE POLICY ledger_owner_read ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS ledger_admin_read ON public.ledger_entries;
CREATE POLICY ledger_admin_read ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (SELECT private.is_platform_admin());

-- Restrict all writes from authenticated users (only internal functions can write via SECURITY DEFINER)
DROP POLICY IF EXISTS ledger_internal_insert ON public.ledger_entries;
CREATE POLICY ledger_internal_insert ON public.ledger_entries
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS ledger_insert_blocked ON public.ledger_entries;
CREATE POLICY ledger_insert_blocked ON public.ledger_entries
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ledger_update_blocked ON public.ledger_entries;
CREATE POLICY ledger_update_blocked ON public.ledger_entries
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS ledger_delete_blocked ON public.ledger_entries;
CREATE POLICY ledger_delete_blocked ON public.ledger_entries
  FOR DELETE TO authenticated
  USING (false);

-- Step 9: Create/update RLS policies for balances
DROP POLICY IF EXISTS balances_owner_read ON public.balances;
CREATE POLICY balances_owner_read ON public.balances
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS balances_admin_read ON public.balances;
CREATE POLICY balances_admin_read ON public.balances
  FOR SELECT TO authenticated
  USING (SELECT private.is_platform_admin());

DROP POLICY IF EXISTS balances_insert_blocked ON public.balances;
CREATE POLICY balances_insert_blocked ON public.balances
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS balances_update_blocked ON public.balances;
CREATE POLICY balances_update_blocked ON public.balances
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS balances_delete_blocked ON public.balances;
CREATE POLICY balances_delete_blocked ON public.balances
  FOR DELETE TO authenticated
  USING (false);

-- Step 10: Ensure trigger for balance updates exists
DROP TRIGGER IF EXISTS trg_ledger_apply ON public.ledger_entries;
CREATE OR REPLACE FUNCTION public.ledger_apply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.balances (owner_id, account, balance)
  VALUES (NEW.owner_id, NEW.account, NEW.amount)
  ON CONFLICT (owner_id, account)
  DO UPDATE SET balance = public.balances.balance + NEW.amount;

  RETURN NEW;
END
$function$;

CREATE TRIGGER trg_ledger_apply
  AFTER INSERT ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.ledger_apply();

-- Step 11: Ensure get_my_balances() RPC exists and is properly granted
CREATE OR REPLACE FUNCTION public.get_my_balances()
RETURNS TABLE (
  account public.ledger_account,
  balance bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT account, balance
  FROM public.balances
  WHERE owner_id = auth.uid()
  ORDER BY
    CASE account
      WHEN 'wallet' THEN 1
      WHEN 'creator_pending' THEN 2
      WHEN 'creator_available' THEN 3
      ELSE 99
    END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_balances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_balances() TO authenticated;

-- Step 12: Internal ledger append function (for financial operations)
CREATE OR REPLACE FUNCTION private.ledger_append(
  _txn_id uuid,
  _account public.ledger_account,
  _owner_id uuid,
  _amount bigint,
  _kind text,
  _ref_type text DEFAULT NULL,
  _ref_id uuid DEFAULT NULL,
  _release_at timestamptz DEFAULT NULL,
  _metadata jsonb DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  entry_id bigint;
BEGIN
  IF _amount = 0 THEN
    RAISE EXCEPTION 'ledger_amount_zero';
  END IF;

  INSERT INTO public.ledger_entries (
    txn_id, account, owner_id, amount, kind, ref_type, ref_id, release_at, metadata
  )
  VALUES (
    _txn_id, _account, _owner_id, _amount, _kind, _ref_type, _ref_id, _release_at,
    COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO entry_id;

  RETURN entry_id;
END
$function$;

REVOKE ALL ON FUNCTION private.ledger_append(uuid, public.ledger_account, uuid, bigint, text, text, uuid, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.ledger_append(uuid, public.ledger_account, uuid, bigint, text, text, uuid, timestamptz, jsonb) TO service_role;

-- Step 13: Reconciliation utility (admin only)
CREATE OR REPLACE FUNCTION public.reconcile_balances(_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  _acct public.ledger_account;
BEGIN
  IF NOT (SELECT private.is_platform_admin()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  DELETE FROM public.balances WHERE owner_id = _owner_id;

  INSERT INTO public.balances (owner_id, account, balance)
  SELECT
    _owner_id,
    account,
    COALESCE(SUM(amount), 0)
  FROM public.ledger_entries
  WHERE owner_id = _owner_id
  GROUP BY account;
END
$function$;

REVOKE ALL ON FUNCTION public.reconcile_balances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_balances(uuid) TO authenticated;

COMMENT ON TABLE public.ledger_entries IS
  'Append-only double-entry ledger. All financial transactions are immutable. No UPDATE/DELETE allowed.';

COMMENT ON TABLE public.balances IS
  'Cached sum of ledger_entries per (owner_id, account). Maintained by trigger. Wallet balance is always non-negative.';

COMMENT ON FUNCTION private.ledger_append(uuid, public.ledger_account, uuid, bigint, text, text, uuid, timestamptz, jsonb) IS
  'Internal function for appending ledger entries. Only accessible via SECURITY DEFINER from financial operations.';
