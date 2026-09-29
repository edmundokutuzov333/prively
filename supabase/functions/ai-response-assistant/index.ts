import { createClient } from "npm:@supabase/supabase-js@2";

const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const env=(n:string)=>{const v=Deno.env.get(n);if(!v)throw new Error("missing_env:"+n);return v;};
const clientFor=(token:string)=>createClient(env("SUPABASE_URL"),env("SUPABASE_ANON_KEY"),{global:{headers:{Authorization:token}},auth:{persistSession:false,autoRefreshToken:false}});
const adminFor=()=>createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return json({ok:true});
  if(req.method!=="POST")return json({code:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("Authorization")??"";
    if(!auth.startsWith("Bearer "))return json({code:"unauthorized"},401);
    const client=clientFor(auth);
    const admin=adminFor();
    const {data:{user},error:userError}=await client.auth.getUser();
    if(userError||!user)return json({code:"unauthorized"},401);

    const {data:flag}=await admin.from("platform_settings").select("value").eq("key","feature_flags.ai_response_assistant").maybeSingle();
    if(flag?.value!==true)return json({code:"ai_response_assistant_disabled"},503);
    if((Deno.env.get("AI_RESPONSE_PROVIDER_APPROVED")??"").toLowerCase()!=="true")return json({code:"ai_provider_not_approved"},503);

    const body=await req.json() as {conversationId?:unknown};
    if(typeof body.conversationId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.conversationId))return json({code:"invalid_conversation"},400);

    const {data:member,error:memberError}=await client.from("conversation_members").select("conversation_id").eq("conversation_id",body.conversationId).eq("user_id",user.id).maybeSingle();
    if(memberError||!member)return json({code:"forbidden"},403);

    const {data:messages,error:messagesError}=await client.from("messages").select("id,sender_id,body,kind,price,created_at").eq("conversation_id",body.conversationId).order("created_at",{ascending:false}).limit(30);
    if(messagesError)return json({code:"conversation_read_failed"},400);

    const ids=(messages??[]).map(m=>m.id);
    const {data:unlocks}=ids.length?await client.from("message_unlocks").select("message_id").eq("user_id",user.id).in("message_id",ids):{data:[]};
    const unlocked=new Set((unlocks??[]).map(x=>x.message_id));
    const usable=(messages??[]).filter(m=>typeof m.body==="string"&&m.body.length>0&&(m.sender_id===user.id||m.price===null||unlocked.has(m.id))).reverse().slice(-20);
    if(usable.length===0)return json({code:"no_usable_context"},422);

    const provider=env("AI_RESPONSE_API_URL");
    const key=env("AI_RESPONSE_API_KEY");
    const response=await fetch(provider,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},body:JSON.stringify({
      contractVersion:"1",
      task:"suggest_replies",
      language:"pt-MZ",
      suggestionsOnly:true,
      conversation:usable.map(m=>({role:m.sender_id===user.id?"user":"other",content:m.body}))
    })});
    if(!response.ok)return json({code:"ai_provider_failed"},502);
    const payload=await response.json() as Record<string,unknown>;
    const raw=Array.isArray(payload.suggestions)?payload.suggestions:[];
    const suggestions=raw.filter((x):x is string=>typeof x==="string").map(x=>x.trim()).filter(Boolean).slice(0,5);
    if(!suggestions.length)return json({code:"ai_provider_invalid"},502);
    await adminFor().from("audit_log").insert({
      actor_id:user.id,event_type:"ai_response_suggestion_generated",target_type:"conversation",target_id:body.conversationId,
      reason:"assistant suggestion",metadata:{count:suggestions.length}
    });
    return json({ok:true,suggestions,sendAutomatically:false});
  }catch(error){
    const code=error instanceof Error?error.message:"ai_response_error";
    return json({code},code==="unauthorized"?401:400);
  }
});