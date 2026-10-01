-- FASE 4: financial runtime contract hardening.
-- Reuse the existing production ledger schema created by earlier migrations.
-- Do not recreate ledger tables or modify already-applied migrations.

DROP POLICY IF EXISTS admin_manage_all ON public.balances;

CREATE POLICY balances_finance_admin_read
  ON public.balances
  FOR SELECT TO authenticated
  USING (
    public.has_role((select auth.uid()), 'finance')
    OR public.has_role((select auth.uid()), 'admin')
  );

-- No authenticated INSERT/UPDATE/DELETE grants are exposed on balances.
REVOKE INSERT, UPDATE, DELETE ON public.balances FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE ON public.ledger_entries FROM authenticated, anon, public;

-- User-facing wallet RPC: expose only spendable and creator-facing balances.
CREATE OR REPLACE FUNCTION public.get_my_balances()
RETURNS TABLE (
  account public.ledger_account,
  balance bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT account_value.account, COALESCE(b.balance, 0)::bigint
  FROM (
    VALUES
      ('wallet'::public.ledger_account),
      ('creator_pending'::public.ledger_account),
      ('creator_available'::public.ledger_account)
  ) AS account_value(account)
  LEFT JOIN public.balances b
    ON b.owner_id = auth.uid()
   AND b.account = account_value.account
  ORDER BY CASE account_value.account
    WHEN 'wallet'::public.ledger_account THEN 1
    WHEN 'creator_pending'::public.ledger_account THEN 2
    WHEN 'creator_available'::public.ledger_account THEN 3
    ELSE 99
  END;
END
$function$;

REVOKE ALL ON FUNCTION public.get_my_balances() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_balances() TO authenticated;

-- Keep balance changes available through Supabase Realtime.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'balances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.balances;
  END IF;
END
$$;

ALTER TABLE public.balances REPLICA IDENTITY DEFAULT;

COMMENT ON FUNCTION public.get_my_balances() IS
  'Returns only the authenticated user wallet, pending creator earnings and available creator earnings.';
