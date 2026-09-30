import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) throw new Error('missing_supabase_local_env');

const publicClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const ts = Date.now();
const clientEmail = 'e2e-client-' + ts + '@example.test';
const creatorEmail = 'e2e-creator-' + ts + '@example.test';
const clientPassword = 'PrivelyE2E!Client' + ts;
const creatorPassword = 'PrivelyE2E!Creator' + ts;
const clientHandle = 'e2eclient' + String(ts).slice(-6);
const creatorHandle = 'e2ecreator' + String(ts).slice(-6);

console.log('===== COMMAND: node scripts/e2e-local-contract.mjs =====');
console.log('SUPABASE_URL=', url);
console.log('CLIENT_EMAIL=', clientEmail);
console.log('CREATOR_EMAIL=', creatorEmail);

const clientSignup = await publicClient.auth.signUp({
  email: clientEmail,
  password: clientPassword,
  options: { data: { handle: clientHandle, display_name: 'E2E Client', signup_role: 'client', role: 'client' } }
});
if (clientSignup.error) throw clientSignup.error;
console.log('AUTH CLIENT signup=', JSON.stringify({ id: clientSignup.data.user?.id, email_confirmed_at: clientSignup.data.user?.email_confirmed_at, session_present: Boolean(clientSignup.data.session) }));
if (!clientSignup.data.user?.id) throw new Error('client_signup_missing_user');
const clientId = clientSignup.data.user.id;

const creatorSignup = await publicClient.auth.signUp({
  email: creatorEmail,
  password: creatorPassword,
  options: { data: { handle: creatorHandle, display_name: 'E2E Creator', signup_role: 'creator', role: 'creator' } }
});
if (creatorSignup.error) throw creatorSignup.error;
console.log('AUTH CREATOR signup=', JSON.stringify({ id: creatorSignup.data.user?.id, email_confirmed_at: creatorSignup.data.user?.email_confirmed_at, session_present: Boolean(creatorSignup.data.session) }));
if (!creatorSignup.data.user?.id) throw new Error('creator_signup_missing_user');
const creatorId = creatorSignup.data.user.id;

try {
  const mailpit = await fetch('http://127.0.0.1:54324/api/v1/messages?limit=50');
  const mailpitJson = await mailpit.json();
  const subjects = (mailpitJson.messages ?? []).map((m) => ({ ID: m.ID, Subject: m.Subject, To: m.To }));
  console.log('MAILPIT status=', mailpit.status, 'messages=', JSON.stringify(subjects));
} catch (error) {
  console.log('MAILPIT error=', error instanceof Error ? error.message : String(error));
}

const roles = await admin.from('user_roles').select('user_id,role').in('user_id',[clientId,creatorId]).order('user_id');
if (roles.error) throw roles.error;
console.log('DB user_roles=', JSON.stringify(roles.data));

const profiles = await admin.from('profiles').select('id,handle,display_name,city,bairro,age_verified_at,status').in('id',[clientId,creatorId]).order('id');
if (profiles.error) throw profiles.error;
console.log('DB profiles=', JSON.stringify(profiles.data));

const clientWallet = await admin.from('balances').select('owner_id,account,balance').eq('owner_id',clientId).order('account');
const creatorWallet = await admin.from('balances').select('owner_id,account,balance').eq('owner_id',creatorId).order('account');
if (clientWallet.error || creatorWallet.error) throw clientWallet.error ?? creatorWallet.error;
console.log('DB client balances=', JSON.stringify(clientWallet.data));
console.log('DB creator balances=', JSON.stringify(creatorWallet.data));

const preLogin = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
const preLoginResult = await preLogin.auth.signInWithPassword({ email: clientEmail, password: clientPassword });
console.log('AUTH login-before-confirm=', JSON.stringify({ session_present: Boolean(preLoginResult.data.session), error: preLoginResult.error?.message ?? null }));
if (!preLoginResult.error || preLoginResult.data.session) throw new Error('login_before_confirmation_was_allowed');

const confirmedBefore = await admin.auth.admin.getUserById(clientId);
console.log('AUTH email_confirmed_at BEFORE=', confirmedBefore.data.user?.email_confirmed_at ?? null);
if (confirmedBefore.data.user?.email_confirmed_at) throw new Error('email_confirmed_before_confirmation');

const confirmClient = await admin.auth.admin.updateUserById(clientId,{email_confirm:true});
const confirmCreator = await admin.auth.admin.updateUserById(creatorId,{email_confirm:true});
if (confirmClient.error) throw confirmClient.error;
if (confirmCreator.error) throw confirmCreator.error;
const confirmedAfter = await admin.auth.admin.getUserById(clientId);
console.log('AUTH email_confirmed_at AFTER=', confirmedAfter.data.user?.email_confirmed_at ?? null);

const signedIn = await publicClient.auth.signInWithPassword({ email: clientEmail, password: clientPassword });
if (signedIn.error) throw signedIn.error;
console.log('AUTH login=', JSON.stringify({ user_id: signedIn.data.user?.id, aal: signedIn.data.session?.user?.aal ?? 'aal1', access_token_present: Boolean(signedIn.data.session?.access_token) }));

const wallet = await publicClient.rpc('get_wallet_summary');
console.log('RPC get_wallet_summary=', JSON.stringify({data:wallet.data,error:wallet.error?.message ?? null}));

const badLegacy = await publicClient.rpc('create_media_upload',{_post:null,_kind:'image',_mime_type:'image/jpeg',_file_size:100,_sha256:'0'.repeat(64),_original_filename:'e2e.jpg'});
console.log('RPC legacy create_media_upload=', JSON.stringify({data:badLegacy.data,error:badLegacy.error?.message ?? null}));
if (badLegacy.error?.message?.includes('Could not choose the best candidate function')) throw new Error('legacy_media_upload_overload_still_present');
if (!badLegacy.error) throw new Error('legacy_media_upload_call_unexpectedly_succeeded');

const creatorClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
const creatorLogin = await creatorClient.auth.signInWithPassword({ email: creatorEmail, password: creatorPassword });
if (creatorLogin.error) throw creatorLogin.error;
console.log('AUTH creator login=', JSON.stringify({ user_id: creatorLogin.data.user?.id, role_claim: creatorLogin.data.user?.user_metadata?.role, aal: creatorLogin.data.session?.user?.aal ?? 'aal1' }));
const sevenArg = await creatorClient.rpc('create_media_upload',{_post:null,_kind:'image',_mime_type:'image/jpeg',_file_size:100,_sha256:'0'.repeat(64),_original_filename:'e2e.jpg',_participants_consent:false});
console.log('RPC 7-arg create_media_upload=', JSON.stringify({data:sevenArg.data,error:sevenArg.error?.message ?? null}));
if (!sevenArg.error || !/consent|participant/i.test(sevenArg.error.message)) throw new Error('seven_arg_media_upload_contract_not_reachable');

const final = await admin.auth.admin.deleteUser(clientId);
const final2 = await admin.auth.admin.deleteUser(creatorId);
console.log('CLEANUP=', JSON.stringify({client_error:final.error?.message ?? null,creator_error:final2.error?.message ?? null}));
console.log('VERDICT=PASS');
