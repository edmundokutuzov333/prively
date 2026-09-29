import { createClient } from "npm:@supabase/supabase-js@2";

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw new Error("missing_env:"+name);return value;};

Deno.serve(async(req)=>{
  if(req.method!=="GET")return json({code:"method_not_allowed"},405);
  try{
    const started=performance.now();
    const admin=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
    const {error}=await admin.rpc("get_health_probe");
    if(error)return json({status:"degraded",database:"error",code:error.message},503);
    return json({
      status:"ok",
      database:"ok",
      service:"prively-api",
      latency_ms:Math.round(performance.now()-started),
      timestamp:new Date().toISOString()
    });
  }catch(error){
    return json({status:"down",code:error instanceof Error?error.message:"health_failed"},503);
  }
});