import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) throw new Error('missing_supabase_local_env');

const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const ts = Date.now();
const clientEmail = 'e2e-client-' + ts + '@example.test';
const creatorEmail = 'e2e-creator-' + ts + '@example.test';
const password = 'PrivelyE2E!' + ts;

console.log('===== COMMAND: node scripts/e2e-local-contract.mjs =====');
console.log('SUPABASE_URL=', url);
console.log('CLIENT_EMAIL=', clientEmail);
console.log('CREATOR_EMAIL=', creatorEmail);

const clientSignUp = await admin.auth.admin.createUser({ email: clientEmail, password, email_confirm: false, user_metadata: {
  handle: 'e2eclient' + String(ts).slice(-6),
  display_name: 'E2E Client',
  signup_role: 'client',
  role: 'client'
}});
if (clientSignUp.error) throw clientSignUp.error;
console.log('AUTH CLIENT signup=', JSON.stringify({ id: clientSignUp.data.user.id, email_confirmed_at: clientSignUp.data.user.email_confirmed_at }));

const creatorSignUp = await admin.auth.admin.createUser({ email: creatorEmail, password, email_confirm: false, user_metadata: {
  handle: 'e2ecreator' + String(ts).slice(-6),
  display_name: 'E2E Creator',
  signup_role: 'creator',
  role: 'creator'
}});
if (creatorSignUp.error) throw creatorSignUp.error;
console.log('AUTH CREATOR signup=', JSON.stringify({ id: creatorSignUp.data.user.id, email_confirmed_at: creatorSignUp.data.user.email_confirmed_at }));

const clientId = clientSignUp.data.user.id;
const creatorId = creatorSignUp.data.user.id;

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

const confirmedBefore = await admin.auth.admin.getUserById(clientId);
console.log('AUTH email_confirmed_at BEFORE=', confirmedBefore.data.user?.email_confirmed_at ?? null);
const confirm = await admin.auth.admin.updateUserById(clientId,{email_confirm:true});
if (confirm.error) throw confirm.error;
const confirmedAfter = await admin.auth.admin.getUserById(clientId);
console.log('AUTH email_confirmed_at AFTER=', confirmedAfter.data.user?.email_confirmed_at ?? null);

const signInClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
const signedIn = await signInClient.auth.signInWithPassword({ email: clientEmail, password });
if (signedIn.error) throw signedIn.error;
console.log('AUTH login=', JSON.stringify({ user_id: signedIn.data.user?.id, aal: signedIn.data.session?.user?.aal ?? 'aal1', access_token_present: Boolean(signedIn.data.session?.access_token) }));

const wallet = await signInClient.rpc('get_wallet_summary');
console.log('RPC get_wallet_summary=', JSON.stringify({data:wallet.data,error:wallet.error?.message ?? null}));

const badLegacy = await signInClient.rpc('create_media_upload',{_post:null,_kind:'image',_mime_type:'image/jpeg',_file_size:100,_sha256:'0'.repeat(64),_original_filename:'e2e.jpg'});
console.log('RPC legacy create_media_upload=', JSON.stringify({data:badLegacy.data,error:badLegacy.error?.message ?? null}));
if (badLegacy.error?.message?.includes('Could not choose the best candidate function')) throw new Error('legacy_media_upload_overload_still_present');

const creatorClient = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
const creatorLogin = await creatorClient.auth.signInWithPassword({ email: creatorEmail, password });
if (creatorLogin.error) throw creatorLogin.error;
const sevenArg = await creatorClient.rpc('create_media_upload',{_post:null,_kind:'image',_mime_type:'image/jpeg',_file_size:100,_sha256:'0'.repeat(64),_original_filename:'e2e.jpg',_participants_consent:false});
console.log('RPC 7-arg create_media_upload=', JSON.stringify({data:sevenArg.data,error:sevenArg.error?.message ?? null}));
if (!sevenArg.error || !/consent|participant/i.test(sevenArg.error.message)) throw new Error('seven_arg_media_upload_contract_not_reachable');

const final = await admin.auth.admin.deleteUser(clientId);
const final2 = await admin.auth.admin.deleteUser(creatorId);
console.log('CLEANUP=', JSON.stringify({client_error:final.error?.message ?? null,creator_error:final2.error?.message ?? null}));
console.log('VERDICT=PASS');
