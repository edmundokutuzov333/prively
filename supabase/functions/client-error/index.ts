import { createClient } from "npm:@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw new Error("missing_env:"+name);return value;};

const clean=(value:unknown,max:number)=>{
  const text=typeof value==="string"?value:"";
  return text.replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
};

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({code:"method_not_allowed"},405);
  try{
    const admin=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
    const ip=req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "unknown";
    const rate=await admin.rpc("phase10_assert_rate_limit",{
      _scope:"client_error",
      _subject:ip,
      _limit:30,
      _window_seconds:60
    });
    if(rate.error?.message?.includes("rate_limit_exceeded"))return json({code:"rate_limit_exceeded"},429);
    if(rate.error)return json({code:"rate_limit_unavailable"},503);

    const body=await req.json().catch(()=>null) as Record<string,unknown> | null;
    if(!body)return json({code:"invalid_json"},400);

    const message=clean(body.message,1000);
    if(!message)return json({code:"message_required"},400);

    const path=clean(body.path,300);
    const fingerprint=clean(body.fingerprint,128) || "unknown";
    const stack=clean(body.stackExcerpt,1200);
    const buildId=clean(body.buildId,128);

    await admin.from("client_error_events").insert({
      fingerprint,
      path,
      message,
      stack_excerpt:stack,
      build_id:buildId
    });

    return json({ok:true});
  }catch(error){
    return json({code:error instanceof Error?error.message:"client_error_failed"},500);
  }
});