/* global process, console */
import pg from "pg";
import fs from "node:fs/promises";

const url = process.env.POSTGRES_URL;
if (!url || !/(127\\.0\\.0\\.1|localhost)/i.test(url)) throw new Error("refusing_non_local_database");

const pool = new pg.Pool({ connectionString: url, max: 30 });
const ids = {
  buyer: "d2000000-0000-0000-0000-000000000001",
  creator: "d2000000-0000-0000-0000-000000000002",
  livePayer: "d2000000-0000-0000-0000-000000000003",
  channel: "d2000000-0000-0000-0000-000000000010",
  liveSession: "d2000000-0000-0000-0000-000000000020",
  spendRef: "d2000000-0000-0000-0000-000000000030",
};
const refs = { duplicate: "CHAOS-DUP-20260930", ordered: "CHAOS-ORDER-20260930" };
const results = [];

async function sql(text, params = []) {
  const client = await pool.connect();
  try { return await client.query(text, params); }
  finally { client.release(); }
}
async function withRole(role, fn) {
  const client = await pool.connect();
  try {
    await client.query("select set_config('request.jwt.claim.role',$1,true)", [role]);
    return await fn(client);
  } finally { client.release(); }
}
function record(id, expected, observed, evidence, pass) {
  results.push({ id, expected, observed, evidence, pass });
}

try {
  await sql("select set_config('app.internal_write','on',true)");
  await sql(
    "insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data,email_confirmed_at,created_at,updated_at) values " +
    "($1,'authenticated','authenticated','resilience-buyer@example.test','test',$4,now(),now(),now())," +
    "($2,'authenticated','authenticated','resilience-creator@example.test','test',$5,now(),now(),now())," +
    "($3,'authenticated','authenticated','resilience-live@example.test','test',$4,now(),now(),now()) on conflict(id) do nothing",
    [ids.buyer, ids.creator, ids.livePayer, '{"handle":"resilience_buyer"}', '{"handle":"resilience_creator","signup_role":"creator"}'],
  );
  await sql("update public.profiles set age_verified_at=now(),status='active' where id = any($1::uuid[])", [[ids.buyer, ids.creator, ids.livePayer]]);
  await sql("insert into public.user_roles(user_id,role) values ($1,'creator') on conflict do nothing", [ids.creator]);
  await sql(
    "insert into public.channels(id,owner_id,handle,display_name,dm_mode) values ($1,$2,'resilience_creator','Resilience Creator','paid') on conflict(id) do nothing",
    [ids.channel, ids.creator],
  );
  await sql("update public.balances set balance=15000 where owner_id=$1 and account='wallet'", [ids.buyer]);
  await sql("update public.balances set balance=1000 where owner_id=$1 and account='wallet'", [ids.livePayer]);

  await sql("update public.platform_settings set value='true'::jsonb where key='wallet.production_enabled'");
  for (const ref of [refs.duplicate, refs.ordered]) {
    await sql(
      "insert into public.topups(user_id,provider,method,amount,currency,internal_reference,provider_ref,status,idempotency_key,metadata) " +
      "values ($1,'paysuite','mpesa',10000,'MZN',$2,$2,'pending',$3,jsonb_build_object('test','resilience')) on conflict(provider_ref) do nothing",
      [ids.buyer, ref, "resilience-" + ref],
    );
  }
  await sql("update public.platform_settings set value='false'::jsonb where key='wallet.production_enabled'");

  {
    const calls = await Promise.all(Array.from({ length: 10 }, function(_, i) {
      return withRole("service_role", async function(client) {
        try {
          await client.query("select public.credit_topup($1,$2,$3,$4)", [refs.duplicate, "paid", 10000, "CHAOS-DUP-TXN-" + i]);
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      });
    }));
    const q = await sql(
      "select t.status,b.balance,(select count(*) from public.ledger_entries l where l.ref_id=t.id and l.ref_type='topup' and l.account='wallet' and l.amount=10000) as wallet_credits " +
      "from public.topups t join public.balances b on b.owner_id=t.user_id and b.account='wallet' where t.provider_ref=$1",
      [refs.duplicate],
    );
    const row = q.rows[0];
    record(
      "webhook-10x",
      "10 parallel paid events result in exactly one wallet credit",
      JSON.stringify({ callsOk: calls.filter(function(x){return x.ok;}).length, status: row.status, walletCredits: row.wallet_credits }),
      "10 concurrent calls to credit_topup against one locked topup row.",
      row.status === "paid" && Number(row.wallet_credits) === 1,
    );
  }

  {
    await sql("select public.credit_topup($1,$2,$3,$4)", [refs.ordered, "paid", 10000, "CHAOS-ORDER-PAID"]);
    await sql("select public.credit_topup($1,$2,$3,$4)", [refs.ordered, "pending", 10000, "CHAOS-ORDER-PENDING"]);
    const q = await sql("select status from public.topups where provider_ref=$1", [refs.ordered]);
    record(
      "webhook-ordering",
      "paid does not regress to pending when an older pending event arrives later",
      "status=" + q.rows[0].status,
      "credit_topup(paid) followed by credit_topup(pending) in isolated local Supabase.",
      q.rows[0].status === "paid",
    );
  }

  {
    const calls = await Promise.all([1,2].map(function(i) {
      return withRole("service_role", async function(client) {
        try {
          const r = await client.query(
            "select public._spend_on_channel($1,$2,$3,$4,$5,$6,$7) as txn",
            [ids.buyer, ids.channel, 10000, "resilience_concurrency", "channel", ids.spendRef, "CHAOS-SPEND-" + i],
          );
          return { ok: true, txn: r.rows[0].txn };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      });
    }));
    const q = await sql(
      "select b.balance,count(*) filter (where l.ref_id=$1 and l.ref_type='channel' and l.kind='resilience_concurrency' and l.account='wallet' and l.amount<0) as debits " +
      "from public.balances b left join public.ledger_entries l on l.owner_id=b.owner_id where b.owner_id=$2 and b.account='wallet' group by b.balance",
      [ids.spendRef, ids.buyer],
    );
    const row = q.rows[0];
    record(
      "spend-concurrency",
      "two simultaneous spends cannot both consume the same balance",
      JSON.stringify({ calls: calls, walletBalance: row && row.balance, debits: row && row.debits }),
      "_spend_on_channel locks the wallet balance row with SELECT FOR UPDATE.",
      calls.filter(function(x){return x.ok;}).length === 1 && Number(row.debits) === 1 && Number(row.balance) === 5000,
    );
  }

  {
    await sql(
      "insert into public.live_sessions(id,channel_id,mode,title,status,room_name,started_at,per_minute_price,billed_minutes) " +
      "values ($1,$2,'paid','Resilience Live','live','resilience-room-20260930',now(),1000,0) on conflict(id) do nothing",
      [ids.liveSession, ids.channel],
    );
    await sql(
      "insert into public.live_participants(session_id,participant_id,joined_at,status) values ($1,$2,now()-interval '2 minutes','active') " +
      "on conflict(session_id,participant_id) do update set joined_at=excluded.joined_at,status='active',left_at=null",
      [ids.liveSession, ids.livePayer],
    );
    const calls = await Promise.all([1,2].map(function() {
      return withRole("service_role", async function(client) {
        const r = await client.query("select public.charge_active_live_minutes() as charged");
        return Number(r.rows[0].charged);
      });
    }));
    const q = await sql(
      "select (select count(*) from public.live_billing_ticks where session_id=$1 and payer_id=$2) as ticks," +
      "(select count(*) from public.ledger_entries where ref_type='live_session' and ref_id=$1 and kind='live_minute' and owner_id=$2 and amount<0) as debits",
      [ids.liveSession, ids.livePayer],
    );
    record(
      "live-reconnect-billing",
      "repeated billing pass does not create a second charge for the same minute",
      JSON.stringify({ calls: calls, ticks: q.rows[0].ticks, debits: q.rows[0].debits }),
      "live_billing_ticks has a primary key on (session_id,payer_id,minute_index); billing uses a deterministic idempotency key.",
      Number(q.rows[0].ticks) === 1 && Number(q.rows[0].debits) === 1,
    );
  }

  {
    const source = await fs.readFile("src/lib/mediaUpload.ts", "utf8");
    const ok = source.includes("findPreviousUploads") && source.includes("resumeFromPreviousUpload") && source.includes("retryDelays");
    record(
      "upload-resume-contract",
      "interrupted upload resumes via TUS",
      ok ? "TUS resume + retry contract present" : "TUS resume contract missing",
      "src/lib/mediaUpload.ts source inspection in CI workspace.",
      ok,
    );
  }

  {
    const source = await fs.readFile("src/lib/supabase.ts", "utf8");
    const ok = source.includes("autoRefreshToken: true");
    record(
      "session-expiry-contract",
      "expired sessions can be refreshed by the client",
      ok ? "autoRefreshToken=true" : "autoRefreshToken missing",
      "This is a client contract check, not a full browser-expiry E2E.",
      ok,
    );
  }

  {
    const source = await fs.readFile("supabase/functions/payments-create-topup/index.ts", "utf8");
    const hasTimeout = source.includes("AbortController") || source.includes("AbortSignal.timeout");
    record(
      "provider-timeout",
      "provider timeout is bounded while the topup remains retryable",
      hasTimeout ? "explicit timeout present" : "no explicit provider timeout present",
      "The pending intent is preserved when fetch rejects, but current code has no explicit AbortController timeout.",
      hasTimeout,
    );
  }

  {
    const source = await fs.readFile("src/pages/ExperiencePages.tsx", "utf8");
    const ok = source.includes("rpc('purchase_ppv'");
    record(
      "offline-purchase-contract",
      "no client-side RPC means no server-side debit; retry is guarded by the purchase record",
      ok ? "PPV debit only via purchase_ppv RPC" : "PPV RPC path not found",
      "This harness cannot toggle browser network during an interactive purchase.",
      ok,
    );
  }

  const allPassed = results.every(function(x){return x.pass;});
  console.log(JSON.stringify({
    ok: allPassed,
    passed: results.filter(function(x){return x.pass;}).length,
    failed: results.filter(function(x){return !x.pass;}).length,
    results: results,
  }, null, 2));
  if (!allPassed) process.exitCode = 1;
} finally {
  try {
    await sql("select set_config('app.internal_write','on',true)");
    await sql("delete from public.ledger_entries where ref_id=$1 and ref_type='channel' and kind='resilience_concurrency'", [ids.spendRef]);
    await sql("delete from public.live_billing_ticks where session_id=$1", [ids.liveSession]);
    await sql("delete from public.live_participants where session_id=$1", [ids.liveSession]);
    await sql("delete from public.live_enforcement_actions where session_id=$1", [ids.liveSession]);
    await sql("delete from public.live_sessions where id=$1", [ids.liveSession]);
    await sql("delete from public.topups where provider_ref = any($1::text[])", [[refs.duplicate, refs.ordered]]);
    await sql("delete from public.idempotency_keys where owner_id in ($1,$2,$3)", [ids.buyer, ids.creator, ids.livePayer]);
    await sql("update public.balances set balance=0 where owner_id in ($1,$2) and account='wallet'", [ids.buyer, ids.livePayer]);
    await sql("delete from public.channels where id=$1", [ids.channel]);
    await sql("delete from auth.users where id = any($1::uuid[])", [[ids.buyer, ids.creator, ids.livePayer]]);
    await sql("update public.platform_settings set value='false'::jsonb where key='wallet.production_enabled'");
    await sql("select set_config('app.internal_write','off',true)");
  } catch (error) {
    console.error("cleanup_failed", error);
    process.exitCode = 1;
  }
  await pool.end();
}
