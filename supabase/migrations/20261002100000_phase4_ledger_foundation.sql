-- FASE 4: Ledger and Wallet Foundation
-- Double-entry append-only accounting system
--
-- Princípios:
-- 1. Saldo nunca é coluna solta — é soma de lançamentos
-- 2. Livro-razão é append-only (sem UPDATE/DELETE)
-- 3. Invariante: wallet sempre >= 0
-- 4. Uma transacção = múltiplos lançamentos (débito/crédito)

CREATE TYPE public.ledger_account AS ENUM (
  'wallet',
  'creator_pending',
  'creator_available',
  'escrow',
  'platform_revenue',
  'external'
);

-- Append-only ledger entries. Every financial event is immutable.
CREATE TABLE public.ledger_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  txn_id uuid NOT NULL DEFAULT gen_random_uuid(),
  account public.ledger_account NOT NULL,
  owner_id uuid NOT NULL REFERENCES public.profiles ON DELETE RESTRICT,
  amount bigint NOT NULL,
  kind text NOT NULL,
  ref_type text CHECK (ref_type IN ('purchase','topup','payout','subscription','adjustment','test')),
  ref_id uuid,
  release_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT amount_not_zero CHECK (amount <> 0)
);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_owner_read ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY ledger_insert_blocked ON public.ledger_entries
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY ledger_update_blocked ON public.ledger_entries
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY ledger_delete_blocked ON public.ledger_entries
  FOR DELETE TO authenticated
  USING (false);

CREATE INDEX idx_ledger_owner_created ON public.ledger_entries(owner_id, created_at DESC);
CREATE INDEX idx_ledger_txn_id ON public.ledger_entries(txn_id);
CREATE INDEX idx_ledger_ref ON public.ledger_entries(ref_type, ref_id) WHERE ref_id IS NOT NULL;

-- Balance cache: SUM of all ledger_entries per (owner_id, account).
-- Maintained via trigger, but can be recalculated if needed.
CREATE TABLE public.balances (
  owner_id uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  account public.ledger_account NOT NULL,
  balance bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, account),
  CONSTRAINT wallet_non_negative CHECK (account <> 'wallet' OR balance >= 0)
);

ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY balances_owner_read ON public.balances
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY balances_insert_blocked ON public.balances
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY balances_update_blocked ON public.balances
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY balances_delete_blocked ON public.balances
  FOR DELETE TO authenticated
  USING (false);

-- Trigger: When a ledger entry is inserted, update the corresponding balance.
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

-- Immutability enforcement: prevent UPDATE and DELETE on ledger.
CREATE OR REPLACE FUNCTION public.ledger_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ledger_is_append_only';
END
$function$;

CREATE TRIGGER trg_ledger_no_upd
  BEFORE UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.ledger_immutable();

-- Prevent INSERT into ledger from authenticated users.
-- Ledger writes happen only via SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.ledger_insert_blocked()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ledger_append_restricted: use ledger RPC functions';
END
$function$;

CREATE TRIGGER trg_ledger_blocked
  BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW
  WHEN (auth.uid() IS NOT NULL)
  EXECUTE FUNCTION public.ledger_insert_blocked();

-- Utility: Get balances for current user
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
  ORDER BY account;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_balances() TO authenticated;

-- Utility: Recalculate balances from ledger (for reconciliation)
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

  FOR _acct IN SELECT DISTINCT account FROM public.ledger_account
  LOOP
    INSERT INTO public.balances (owner_id, account, balance)
    SELECT _owner_id, _acct, COALESCE(SUM(amount), 0)
    FROM public.ledger_entries
    WHERE owner_id = _owner_id AND account = _acct;
  END LOOP;
END
$function$;

REVOKE ALL ON FUNCTION public.reconcile_balances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_balances(uuid) TO authenticated;

COMMENT ON TABLE public.ledger_entries IS
  'Append-only double-entry ledger. No UPDATE/DELETE allowed. Reflects all account movements.';

COMMENT ON TABLE public.balances IS
  'Cached sum of ledger_entries per (owner_id, account). Maintained by trigger. Wallet balance is non-negative.';

COMMENT ON COLUMN public.balances.account IS
  'Account type: wallet (spendable), creator_pending (72h hold), creator_available (ready to payout), escrow, platform_revenue, external.';
