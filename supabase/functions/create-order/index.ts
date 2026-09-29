import { createClient } from "npm:@supabase/supabase-js@2";
import { corsFor } from "../_shared/cors.ts";

const cors = corsFor();
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const env=(n:string)=>{const v=Deno.env.get(n);if(!v)throw new Error("missing_env:"+n);return v;};
const b64=(bytes:Uint8Array)=>{let s="";for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(s);};
const decodeKey=(value:string)=>{try{const raw=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(raw.length===32)return raw;}catch{/* invalid base64, fall back to raw key */};const raw=new TextEncoder().encode(value);if(raw.length!==32)throw new Error("shipping_key_invalid");return raw;};
const userClient=(token:string)=>createClient(env("SUPABASE_URL"),env("SUPABASE_ANON_KEY"),{global:{headers:{Authorization:token}},auth:{persistSession:false,autoRefreshToken:false}});
const serviceClient=()=>createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return json({ok:true});
  if(req.method!=="POST")return json({code:"method_not_allowed"},405);
  try{
    const auth=req.headers.get("Authorization")??"";
    if(!auth.startsWith("Bearer "))return json({code:"unauthorized"},401);
    const client=userClient(auth);
    const {data:{user},error:userError}=await client.auth.getUser();
    if(userError||!user)return json({code:"unauthorized"},401);
    const admin=serviceClient();
    const {data:flag}=await admin.from("platform_settings").select("value").eq("key","feature_flags.store").maybeSingle();
    if(flag?.value!==true)return json({code:"store_disabled"},503);

    const body=await req.json() as {items?:unknown;shipping?:unknown;promotionCode?:unknown;idempotencyKey?:unknown};
    if(!Array.isArray(body.items)||body.items.length===0||body.items.length>50)return json({code:"order_items_required"},400);
    const idem=typeof body.idempotencyKey==="string"?body.idempotencyKey.trim():"";
    if(idem.length<8||idem.length>128)return json({code:"invalid_idempotency_key"},400);
    if(!body.shipping||typeof body.shipping!=="object")return json({code:"shipping_required"},400);

    const shipping=body.shipping as Record<string,unknown>;
    const fields=["fullName","addressLine1","city","province","postalCode","phone","country"] as const;
    for(const field of fields){
      if(typeof shipping[field]!=="string"||String(shipping[field]).trim().length<2||String(shipping[field]).length>160)return json({code:"invalid_shipping"},400);
    }
    if(String(shipping.country).toUpperCase()!=="MZ")return json({code:"shipping_country_not_supported"},400);

    const key=decodeKey(env("ORDER_SHIPPING_KEY"));
    const nonce=crypto.getRandomValues(new Uint8Array(12));
    const plaintext=new TextEncoder().encode(JSON.stringify({...shipping,schemaVersion:1}));
    const cryptoKey=await crypto.subtle.importKey("raw",key,{name:"AES-GCM"},false,["encrypt"]);
    const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},cryptoKey,plaintext));

    const {data,error}=await client.rpc("create_order_v2",{
      _items:body.items,
      _shipping_ciphertext:b64(ciphertext),
      _shipping_nonce:b64(nonce),
      _idem:idem,
      _promotion_code:typeof body.promotionCode==="string"?body.promotionCode:null
    });
    if(error)return json({code:error.message||"order_create_failed"},400);
    return json({ok:true,orderId:data});
  }catch(error){
    const code=error instanceof Error?error.message:"order_create_error";
    return json({code},code==="unauthorized"?401:400);
  }
});
