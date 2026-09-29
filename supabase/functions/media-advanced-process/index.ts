import { createClient } from "npm:@supabase/supabase-js@2";
import { corsFor } from "../_shared/cors.ts";

const cors = corsFor();
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const env=(n:string)=>{const v=Deno.env.get(n);if(!v)throw new Error("missing_env:"+n);return v;};

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return json({ok:true});
  if(req.method!=="POST")return json({code:"method_not_allowed"},405);
  try{
    const token=req.headers.get("Authorization")??"";
    if(!token.startsWith("Bearer "))return json({code:"unauthorized"},401);
    const url=env("SUPABASE_URL");
    const anon=env("SUPABASE_ANON_KEY");
    const client=createClient(url,anon,{global:{headers:{Authorization:token}},auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(url,env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await client.auth.getUser();
    if(userError||!user)return json({code:"unauthorized"},401);

    const body=await req.json() as {assetId?:unknown;operation?:unknown};
    const assetId=typeof body.assetId==="string"?body.assetId:"";
    const operation=typeof body.operation==="string"?body.operation:"";
    if(!/^[0-9a-f-]{36}$/i.test(assetId))return json({code:"invalid_asset_id"},400);
    if(!["caption","face_blur","advanced_media"].includes(operation))return json({code:"invalid_operation"},400);

    const flagKey=operation==="caption"?"feature_flags.auto_captions":operation==="face_blur"?"feature_flags.face_blur":"feature_flags.advanced_media_processing";
    const {data:flag}=await admin.from("platform_settings").select("value").eq("key",flagKey).maybeSingle();
    if(flag?.value!==true)return json({code:"feature_disabled"},503);
    if(!Deno.env.get("MEDIA_PROCESSOR_ENDPOINT"))return json({code:"processor_not_configured"},503);

    const {data:asset,error:assetError}=await admin.from("media_assets").select("id,channel_id,storage_path,integrity_status").eq("id",assetId).maybeSingle();
    if(assetError||!asset)return json({code:"asset_not_found"},404);
    const {data:channel}=await admin.from("channels").select("owner_id").eq("id",asset.channel_id).maybeSingle();
    if(channel?.owner_id!==user.id&&!await admin.rpc("has_role",{_uid:user.id,_role:"admin"}).then(r=>r.data===true))return json({code:"forbidden"},403);
    if(asset.integrity_status!=="verified")return json({code:"asset_not_ready"},409);

    const {data:job,error:jobError}=await admin.from("media_processing_jobs").insert({
      asset_id:assetId,
      job_type:operation,
      status:"queued",
      processor:"configured-provider",
      input:{contractVersion:"1",operation,requestedBy:user.id}
    }).select("id,status").single();
    if(jobError||!job)return json({code:"job_create_failed"},400);

    const worker=await fetch(url+"/functions/v1/process-media-job",{method:"POST",headers:{Authorization:token,"Content-Type":"application/json",apikey:anon},body:JSON.stringify({jobId:job.id})});
    const result=await worker.json().catch(()=>({}));
    if(!worker.ok)return json({ok:true,jobId:job.id,status:"queued",workerCode:result?.code??"worker_pending"},202);
    return json({ok:true,jobId:job.id,status:result?.status??"queued",output:result?.output??null},worker.status===200?200:202);
  }catch(error){
    const code=error instanceof Error?error.message:"media_advanced_error";
    return json({code},code==="unauthorized"?401:400);
  }
});
