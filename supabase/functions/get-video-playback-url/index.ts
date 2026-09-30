import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";
import { embedUrl } from "../_shared/streamtape.ts";

Deno.serve(async(request)=>{
  if(request.method==="OPTIONS") return optionsResponse(request);
  if(request.method!=="POST") return jsonResponse({code:"method_not_allowed"},405,request);
  try{
    const {client,user}=await requireUser(request);
    const body=await request.json() as {asset_id?:unknown};
    if(typeof body.asset_id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.asset_id)) return jsonResponse({code:"invalid_asset_id"},400,request);

    const {data,error}=await client.rpc("get_media_access",{_asset:body.asset_id});
    if(error||!data||typeof data!=="object") return jsonResponse({code:"media_forbidden"},403,request);
    const access=data as Record<string,unknown>;
    if(access.kind!=="video") return jsonResponse({code:"streamtape_video_required"},422,request);
    if(access.storage_provider!=="backblaze_b2") return jsonResponse({code:"b2_storage_required"},422,request);
    if(access.processing_status!=="ready") return jsonResponse({code:"media_not_ready"},409,request);
    if(access.streamtape_status!=="ready"||typeof access.streamtape_file_id!=="string") return jsonResponse({code:"streamtape_not_ready"},409,request);

    const embed=embedUrl(access.streamtape_file_id), expiresAt=new Date(Date.now()+3600*1000).toISOString();
    const {error:logError}=await serviceClient().from("media_access_logs").insert({asset_id:body.asset_id,user_id:user.id,action:"streamtape_embed",granted:true,reason:"authorized_streamtape_playback"});
    if(logError) throw new Error("media_playback_audit_failed");

    return jsonResponse({ok:true,embed_url:embed,expires_at:expiresAt},200,request);
  }catch(error){
    const code=error instanceof Error?error.message:"video_playback_error";
    return jsonResponse({code},code==="unauthorized"?401:403,request);
  }
});
