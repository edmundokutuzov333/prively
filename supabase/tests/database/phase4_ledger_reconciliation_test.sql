BEGIN;

SELECT plan(14);

DO $$
DECLARE
  user1 uuid := '70000000-0000-0000-0000-000000000001';
  user2 uuid := '70000000-0000-0000-0000-000000000002';
  admin_user uuid := '70000000-0000-0000-0000-000000000003';
  entry_id bigint;
  txn uuid;
BEGIN
  -- Setup: Create users in auth.users
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_user_meta_data)
  VALUES
    (user1, 'authenticated', 'authenticated', 'phase4-reconcile-user1@test', 'pass', '{"handle":"reconcile_user1"}'::jsonb),
    (user2, 'authenticated', 'authenticated', 'phase4-reconcile-user2@test', 'pass', '{"handle":"reconcile_user2"}'::jsonb),
    (admin_user, 'authenticated', 'authenticated', 'phase4-reconcile-admin@test', 'pass', '{"handle":"reconcile_admin"}'::jsonb);

  -- Setup: Activate profiles (internal write)
  PERFORM set_config('app.internal_write', 'on', true);
  UPDATE public.profiles SET status='active' WHERE id IN (user1, user2, admin_user);
  
  -- Make admin_user an admin
  INSERT INTO public.user_roles(user_id, role) VALUES (admin_user, 'admin');

  -- Test 1: ledger_entries table exists
  PERFORM ok(to_regclass('public.ledger_entries') IS NOT NULL, 'ledger_entries table exists');

  -- Test 2: balances table exists
  PERFORM ok(to_regclass('public.balances') IS NOT NULL, 'balances table exists');

  -- Test 3: ledger_account enum exists
  PERFORM ok(to_regtype('public.ledger_account') IS NOT NULL, 'ledger_account enum exists');

  -- Test 4: RLS enabled on ledger_entries
  PERFORM ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.ledger_entries'::regclass), 'ledger_entries has RLS');

  -- Test 5: RLS enabled on balances
  PERFORM ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.balances'::regclass), 'balances has RLS');

  -- Test 6: Immutability trigger prevents UPDATE
  INSERT INTO public.ledger_entries (txn_id, account, owner_id, amount, kind, ref_type, ref_id)
  VALUES (gen_random_uuid(), 'wallet', user1, 1000, 'test_topup', 'topup', NULL)
  RETURNING id INTO entry_id;

  BEGIN
    UPDATE public.ledger_entries SET amount = 0 WHERE id = entry_id;
    PERFORM ok(false, 'UPDATE ledger_entries should have failed');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM ok(SQLERRM ~ 'ledger_is_append_only', 'UPDATE blocked with ledger_is_append_only');
  END;

  -- Test 7: Immutability trigger prevents DELETE
  BEGIN
    DELETE FROM public.ledger_entries WHERE id = entry_id;
    PERFORM ok(false, 'DELETE from ledger_entries should have failed');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM ok(SQLERRM ~ 'ledger_is_append_only', 'DELETE blocked with ledger_is_append_only');
  END;

  -- Test 8: Balance updated via trigger after INSERT
  PERFORM ok(
    (SELECT balance FROM public.balances WHERE owner_id=user1 AND account='wallet') = 1000,
    'balance updated by trigger after INSERT'
  );

  -- Test 9: Wallet non-negative constraint enforced
  BEGIN
    INSERT INTO public.balances (owner_id, account, balance) VALUES (user2, 'wallet', -500);
    PERFORM ok(false, 'wallet_non_negative constraint should have blocked -500');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM ok(SQLERRM ~ 'wallet_non_negative', 'wallet_non_negative constraint enforced');
  END;

  -- Test 10: RLS blocks unauthorized read
  -- Set session to user2
  PERFORM set_config('request.jwt.claim.sub', user2::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM ok(
    (SELECT COUNT(*) FROM public.balances WHERE owner_id=user1) = 0,
    'user2 cannot read user1 balances (RLS blocks)'
  );

  -- Test 11: Owner can read own balances
  PERFORM set_config('request.jwt.claim.sub', user1::text, true);
  PERFORM ok(
    (SELECT COUNT(*) FROM public.balances WHERE owner_id=user1) > 0,
    'user1 can read own balances'
  );

  -- Test 12: get_my_balances() RPC works
  PERFORM ok(
    (SELECT COUNT(*) FROM public.get_my_balances()) > 0,
    'get_my_balances() returns data'
  );

  -- Test 13: Sum-zero constraint per transaction
  txn := gen_random_uuid();
  INSERT INTO public.ledger_entries (txn_id, account, owner_id, amount, kind)
  VALUES
    (txn, 'wallet', user1, -500, 'test_purchase'),
    (txn, 'escrow', user2, 500, 'test_escrow');

  PERFORM ok(
    (SELECT COUNT(*) FROM public.ledger_entries WHERE txn_id=txn) = 2,
    'two entries inserted for balanced transaction'
  );

  -- Test 14: Reconciliation utility (admin only)
  PERFORM set_config('request.jwt.claim.sub', admin_user::text, true);
  PERFORM public.reconcile_balances(user1);
  PERFORM ok(
    (SELECT COUNT(*) FROM public.balances WHERE owner_id=user1) > 0,
    'reconcile_balances() recalculated balances for admin'
  );
END $$;

SELECT * FROM finish();
ROLLBACK;
