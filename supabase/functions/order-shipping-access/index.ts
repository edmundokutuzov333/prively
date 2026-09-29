import { createClient } from "npm:@supabase/supabase-js@2";

const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const env=(n:string)=>{const v=Deno.env.get(n);if(!v)throw new Error("missing_env:"+n);return v;};
const userClient=(token:string)=>createClient(env("SUPABASE_URL"),env("SUPABASE_ANON_KEY"),{global:{headers:{Authorization:token}},auth:{persistSession:false,autoRefreshToken:false}});
const serviceClient=()=>createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
const fromB64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return json({ok:true});
  if(req.method!=="POST")return json({code:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("Authorization")??"";
    if(!auth.startsWith("Bearer "))return json({code:"unauthorized"},401);
    const client=userClient(auth);
    const {data:{user},error:userError}=await client.auth.getUser();
    if(userError||!user)return json({code:"unauthorized"},401);
    const body=await req.json() as {orderId?:unknown};
    if(typeof body.orderId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.orderId))return json({code:"invalid_order_id"},400);
    const admin=serviceClient();
    const {data:order,error}=await admin.from("orders").select("id,channel_id,shipping_ciphertext,shipping_nonce,shipping_schema_version").eq("id",body.orderId).maybeSingle();
    if(error||!order)return json({code:"order_not_found"},404);
    const {data:channel}=await admin.from("channels").select("owner_id").eq("id",order.channel_id).maybeSingle();
    if(channel?.owner_id!==user.id)return json({code:"forbidden"},403);
    if(typeof order.shipping_ciphertext!=="string"||typeof order.shipping_nonce!=="string")return json({code:"shipping_not_available"},404);

    const keyValue=env("ORDER_SHIPPING_KEY");
    let keyBytes:Uint8Array;
    try{keyBytes=Uint8Array.from(atob(keyValue),c=>c.charCodeAt(0));}catch{keyBytes=new TextEncoder().encode(keyValue);}
    if(keyBytes.length!==32)return json({code:"shipping_key_invalid"},500);
    const cryptoKey=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["decrypt"]);
    const plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(order.shipping_nonce)},cryptoKey,fromB64(order.shipping_ciphertext));
    const shipping=JSON.parse(new TextDecoder().decode(plaintext)) as Record<string,unknown>;
    await admin.from("audit_log").insert({
      actor_id:user.id,
      event_type:"order_shipping_access",
      target_type:"order",
      target_id:order.id,
      reason:"channel owner accessed encrypted shipping details",
      metadata:{channel_id:order.channel_id}
    });
    return json({ok:true,orderId:order.id,schemaVersion:order.shipping_schema_version,shipping});
  }catch(error){
    const code=error instanceof Error?error.message:"shipping_access_error";
    return json({code},code==="unauthorized"?401:400);
  }
});