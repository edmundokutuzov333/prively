BEGIN;

SELECT plan(12);

-- Test 1: ledger_entries table exists
SELECT ok(to_regclass('public.ledger_entries') IS NOT NULL, 'ledger_entries table exists');

-- Test 2: balances table exists
SELECT ok(to_regclass('public.balances') IS NOT NULL, 'balances table exists');

-- Test 3: ledger_account enum exists
SELECT ok(to_regtype('public.ledger_account') IS NOT NULL, 'ledger_account enum exists');

-- Test 4: RLS is enabled on both tables
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.ledger_entries'::regclass), 'ledger_entries has RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.balances'::regclass), 'balances has RLS');

DO $$
DECLARE
  user1 uuid := '60000000-0000-0000-0000-000000000001';
  user2 uuid := '60000000-0000-0000-0000-000000000002';
  entry_id bigint;
BEGIN
  -- Setup: Create users
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_user_meta_data)
  VALUES
    (user1, 'authenticated', 'authenticated', 'phase4-user1@example.test', 'test', '{"handle":"phase4_user1"}'::jsonb),
    (user2, 'authenticated', 'authenticated', 'phase4-user2@example.test', 'test', '{"handle":"phase4_user2"}'::jsonb);

  PERFORM set_config('app.internal_write', 'on', true);
  UPDATE public.profiles SET status='active' WHERE id IN (user1, user2);

  -- Test 6: Insert a ledger entry as internal (SECURITY DEFINER)
  INSERT INTO public.ledger_entries (txn_id, account, owner_id, amount, kind, ref_type, ref_id)
  VALUES (gen_random_uuid(), 'wallet', user1, 1000, 'test_topup', 'topup', NULL)
  RETURNING id INTO entry_id;
  PERFORM ok(entry_id IS NOT NULL, 'ledger entry inserted via internal write');

  -- Test 7: Balance was updated via trigger
  PERFORM ok(
    (SELECT balance FROM public.balances WHERE owner_id=user1 AND account='wallet') = 1000,
    'balance updated via trigger to 1000'
  );

  -- Test 8: Try to UPDATE ledger (should fail)
  BEGIN
    UPDATE public.ledger_entries SET amount = 0 WHERE id = entry_id;
    PERFORM ok(false, 'UPDATE ledger_entries should have failed');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM ok(SQLERRM ~ 'ledger_is_append_only', 'UPDATE ledger_entries blocked: ' || SQLERRM);
  END;

  -- Test 9: Try to DELETE from ledger (should fail)
  BEGIN
    DELETE FROM public.ledger_entries WHERE id = entry_id;
    PERFORM ok(false, 'DELETE from ledger_entries should have failed');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM ok(SQLERRM ~ 'ledger_is_append_only', 'DELETE from ledger_entries blocked: ' || SQLERRM);
  END;

  -- Test 10: Verify wallet balance >= 0 constraint (check should hold)
  BEGIN
    INSERT INTO public.balances (owner_id, account, balance) VALUES (user2, 'wallet', -100);
    PERFORM ok(false, 'wallet_non_negative constraint should have blocked negative balance');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM ok(SQLERRM ~ 'wallet_non_negative', 'wallet_non_negative constraint enforced');
  END;

  -- Test 11: User1 can read own balances, User2 cannot read User1's via RLS
  PERFORM set_config('request.jwt.claim.sub', user1::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', user1::text, 'role', 'authenticated', 'aud', 'authenticated'
  )::text, true);

  PERFORM ok(
    (SELECT COUNT(*) FROM public.balances WHERE owner_id=user1) > 0,
    'user1 can read own balances'
  );

  PERFORM set_config('request.jwt.claim.sub', user2::text, true);
  PERFORM ok(
    (SELECT COUNT(*) FROM public.balances WHERE owner_id=user1) = 0,
    'user2 cannot read user1 balances (RLS)'
  );

  -- Test 12: get_my_balances() function returns correct data
  PERFORM set_config('request.jwt.claim.sub', user1::text, true);
  PERFORM ok(
    (SELECT COUNT(*) FROM public.get_my_balances()) > 0,
    'get_my_balances() returns data for user1'
  );
END $$;

SELECT * FROM finish();
ROLLBACK;
