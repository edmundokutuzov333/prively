BEGIN;

SELECT plan(21);

SELECT ok(to_regclass('public.ledger_entries') IS NOT NULL, 'ledger_entries table exists');
SELECT ok(to_regclass('public.balances') IS NOT NULL, 'balances table exists');
SELECT ok(to_regtype('public.ledger_account') IS NOT NULL, 'ledger_account enum exists');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.ledger_entries'::regclass), 'ledger_entries has RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.balances'::regclass), 'balances has RLS');

SELECT ok(not has_table_privilege('authenticated','public.ledger_entries','INSERT'), 'authenticated cannot insert ledger entries directly');
SELECT ok(not has_table_privilege('authenticated','public.ledger_entries','UPDATE'), 'authenticated cannot update ledger entries directly');
SELECT ok(not has_table_privilege('authenticated','public.ledger_entries','DELETE'), 'authenticated cannot delete ledger entries directly');
SELECT ok(not has_table_privilege('authenticated','public.balances','INSERT'), 'authenticated cannot insert balances directly');
SELECT ok(not has_table_privilege('authenticated','public.balances','UPDATE'), 'authenticated cannot update balances directly');
SELECT ok(not has_table_privilege('authenticated','public.balances','DELETE'), 'authenticated cannot delete balances directly');

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname='supabase_realtime'
      AND schemaname='public'
      AND tablename='balances'
  ),
  'balances is published to Supabase Realtime'
);

DO $$
DECLARE
  user1 uuid := '60000000-0000-0000-0000-000000000001';
  user2 uuid := '60000000-0000-0000-0000-000000000002';
  txn uuid := '60000000-0000-0000-0000-000000000099';
  wallet_entry bigint;
  external_entry bigint;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_user_meta_data)
  VALUES
    (user1, 'authenticated', 'authenticated', 'phase4-user1@example.test', 'test', '{"handle":"phase4_user1"}'::jsonb),
    (user2, 'authenticated', 'authenticated', 'phase4-user2@example.test', 'test', '{"handle":"phase4_user2"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  PERFORM set_config('app.internal_write', 'on', true);

  INSERT INTO public.profiles(id,handle,display_name,status)
  VALUES
    (user1,'phase4_user1','Phase 4 User 1','active'),
    (user2,'phase4_user2','Phase 4 User 2','active')
  ON CONFLICT(id) DO UPDATE SET status='active';

  SET LOCAL ROLE service_role;

  INSERT INTO public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id)
  VALUES(txn,'wallet',user1,1000,'phase4_test','topup',NULL)
  RETURNING id INTO wallet_entry;

  INSERT INTO public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id)
  VALUES(txn,'external','00000000-0000-0000-0000-000000000000'::uuid,-1000,'phase4_test','topup',NULL)
  RETURNING id INTO external_entry;

  SET CONSTRAINTS ALL IMMEDIATE;

  PERFORM ok(wallet_entry IS NOT NULL AND external_entry IS NOT NULL, 'balanced double-entry transaction inserted');

  PERFORM set_config('request.jwt.claim.sub', user1::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', user1::text, 'role', 'authenticated', 'aud', 'authenticated', 'aal', 'aal2'
  )::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM ok(
    (SELECT balance FROM public.balances WHERE owner_id=user1 AND account='wallet') = 1000,
    'ledger trigger updated wallet balance'
  );

  PERFORM ok(
    (SELECT COUNT(*) FROM public.balances WHERE owner_id=user1) >= 1,
    'owner can read own balances'
  );

  PERFORM set_config('request.jwt.claim.sub', user2::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', user2::text, 'role', 'authenticated', 'aud', 'authenticated', 'aal', 'aal2'
  )::text, true);

  PERFORM ok(
    (SELECT COUNT(*) FROM public.balances WHERE owner_id=user1) = 0,
    'non-owner cannot read another user balances'
  );

  PERFORM ok(
    (SELECT COUNT(*) FROM public.get_my_balances()) = 3,
    'get_my_balances returns exactly three user-facing accounts'
  );

  PERFORM ok(
    (SELECT balance FROM public.get_my_balances() WHERE account='wallet') = 0,
    'user2 wallet starts at zero'
  );

  RESET ROLE;
  SET LOCAL ROLE service_role;

  BEGIN
    UPDATE public.ledger_entries SET amount=0 WHERE id=wallet_entry;
    PERFORM ok(false, 'ledger UPDATE must be rejected');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM ok(SQLERRM='ledger_is_append_only', 'ledger UPDATE is immutable');
  END;

  BEGIN
    DELETE FROM public.ledger_entries WHERE id=wallet_entry;
    PERFORM ok(false, 'ledger DELETE must be rejected');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM ok(SQLERRM='ledger_is_append_only', 'ledger DELETE is immutable');
  END;

  BEGIN
    INSERT INTO public.balances(owner_id,account,balance)
    VALUES(user2,'wallet',-1);
    PERFORM ok(false, 'negative wallet balance must be rejected');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM ok(SQLERRM ~ 'wallet_non_negative', 'wallet balance remains non-negative');
  END;

  SET CONSTRAINTS ALL DEFERRED;
  PERFORM ok(public.reconcile_ledger()=0, 'ledger reconciles to zero mismatches');
END $$;

SELECT * FROM finish();
ROLLBACK;
