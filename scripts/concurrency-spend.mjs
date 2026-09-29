/* global process, console */
/* Deliberately only runs when DATABASE_URL points to local/staging. */
import pg from 'pg';

const target = process.env.DATABASE_URL ?? '';
if (!/(localhost|127\.0\.0\.1|staging)/i.test(target)) throw new Error('refusing_non_local_or_staging_database');
const pool = new pg.Pool({ connectionString: target, max: 20 });
const userId = process.env.TEST_USER_ID;
const channelId = process.env.TEST_CHANNEL_ID;
if (!userId || !channelId) throw new Error('TEST_USER_ID and TEST_CHANNEL_ID are required');

const call = async (idem) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role: 'authenticated', aal: 'aal2' })]);
    const result = await client.query('select public.spend_on_channel($1,$2,$3,$4,$5,$6)', [channelId, 10000, 'concurrency_test', 'channel', channelId, idem]);
    await client.query('commit');
    return { ok: true, result: result.rows[0] };
  } catch (error) {
    await client.query('rollback');
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally { client.release(); }
};

const results = await Promise.all(Array.from({ length: 20 }, (_, index) => call(`concurrency:${index}`)));
const sameKey = await Promise.all(Array.from({ length: 20 }, () => call('concurrency:same-key')));
console.log(JSON.stringify({ differentKeys: results, sameKey }, null, 2));
await pool.end();
