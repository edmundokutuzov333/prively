import { serviceClient } from '../_shared/auth.ts';
import { corsFor } from '../_shared/cors.ts';
import { RoomServiceClient } from 'npm:livekit-server-sdk@2.19.1';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsFor(), 'content-type': 'application/json' } });
function sameSecret(left: string, right: string): boolean { const a = new TextEncoder().encode(left); const b = new TextEncoder().encode(right); if (a.length !== b.length) return false; let diff=0; for(let i=0;i<a.length;i+=1) diff|=a[i]^b[i]; return diff===0; }
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);
  const admin=serviceClient(); const {data:expected}=await admin.rpc('financial_secret',{_name:'prively_live_enforcer_token'});
  if(typeof expected!=='string'||!sameSecret(request.headers.get('x-prively-job-token')??'',expected)) return json({code:'forbidden'},403);
  const {data:actions}=await admin.from('live_enforcement_actions').select('id,session_id,participant_id').eq('status','pending').order('created_at').limit(50);
  const livekitUrl=Deno.env.get('LIVEKIT_URL');
  const apiKey=Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret=Deno.env.get('LIVEKIT_API_SECRET');
  if(!livekitUrl||!apiKey||!apiSecret) return json({ok:true,skipped:true,reason:'livekit_provider_not_configured'});
  const rooms = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
  let processed=0;
  for(const action of actions??[]) {
    const session = await admin.from('live_sessions').select('room_name').eq('id', action.session_id).maybeSingle();
    if (!session.data?.room_name) {
      await admin.from('live_enforcement_actions').update({status:'failed',processed_at:new Date().toISOString()}).eq('id',action.id);
      continue;
    }
    try {
      await rooms.removeParticipant(session.data.room_name, action.participant_id);
      await admin.from('live_enforcement_actions').update({status:'done',processed_at:new Date().toISOString()}).eq('id',action.id);
      processed+=1;
    } catch {
      await admin.from('live_enforcement_actions').update({status:'failed',processed_at:new Date().toISOString()}).eq('id',action.id);
    }
  }
  return json({ok:true,processed});
});
