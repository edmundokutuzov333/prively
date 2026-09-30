import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";
import { presignDownload } from "../_shared/b2.ts";
import { B2UrlExpiredError, mapStreamtapeError, remoteUpload, StreamtapeAuthError, StreamtapeUnavailableError } from "../_shared/streamtape.ts";

Deno.serve(async (request)=>{
  if(request.method==="OPTIONS") return optionsResponse(request);
  if(request.method!=="POST") return jsonResponse({code:"method_not_allowed"},405,request);
  try{
    const {client,user}=await requireUser(request);
    const body=await request.json() as {asset_id?:unknown;folder_id?:unknown};
    if(typeof body.asset_id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.asset_id)) return jsonResponse({code:"invalid_asset_id"},400,request);
    const folderId=body.folder_id===undefined||body.folder_id===null?undefined:typeof body.folder_id==="string"&&body.folder_id.length<=128?body.folder_id:null;
    if(folderId===null) return jsonResponse({code:"invalid_folder_id"},400,request);

    const {data:asset,error}=await client.from("media_assets").select("id,channel_id,kind,storage_provider,storage_path,mime_type,original_filename,processing_status,integrity_status,moderation_status,scan_status,streamtape_status,streamtape_upload_id,streamtape_file_id,streamtape_attempts").eq("id",body.asset_id).is("deleted_at",null).maybeSingle();
    if(error||!asset) return jsonResponse({code:"media_forbidden"},403,request);
    if(String(asset.kind)!=="video") return jsonResponse({code:"streamtape_video_required"},422,request);
    if(String(asset.storage_provider)!=="backblaze_b2") return jsonResponse({code:"b2_storage_required"},422,request);

    const {data:channel}=await client.from("channels").select("owner_id").eq("id",asset.channel_id).maybeSingle();
    if(!channel||String(channel.owner_id)!==user.id) return jsonResponse({code:"media_forbidden"},403,request);

    const status=String(asset.streamtape_status??"not_started"), attempts=Number(asset.streamtape_attempts??0);
    if(status==="ready"&&typeof asset.streamtape_file_id==="string") return jsonResponse({ok:true,upload_id:asset.streamtape_upload_id,status:"ready",file_id:asset.streamtape_file_id},200,request);
    if(status==="processing"&&typeof asset.streamtape_upload_id==="string") return jsonResponse({ok:true,upload_id:asset.streamtape_upload_id,status:"processing"},200,request);
    if(attempts>=2) return jsonResponse({code:"streamtape_upload_failed",retry:false},409,request);

    if(String(asset.processing_status)!=="ready"||String(asset.integrity_status)!=="verified"||String(asset.moderation_status)!=="clean"||String(asset.scan_status)!=="clean")
      return jsonResponse({code:"media_not_ready",processing_status:asset.processing_status,integrity_status:asset.integrity_status,moderation_status:asset.moderation_status,scan_status:asset.scan_status},409,request);

    try{
      const sourceUrl=await presignDownload(String(asset.storage_path),3600);
      const result=await remoteUpload(sourceUrl,folderId,typeof asset.original_filename==="string"?asset.original_filename:undefined);
      const {error:updateError}=await serviceClient().from("media_assets").update({
        streamtape_upload_id:result.id,streamtape_status:"processing",streamtape_attempts:attempts+1,streamtape_last_error:null,streamtape_last_checked_at:new Date().toISOString()
      }).eq("id",asset.id);
      if(updateError) throw new Error("streamtape_state_update_failed");
      return jsonResponse({ok:true,upload_id:result.id,status:"processing"},200,request);
    }catch(error){
      const mapped=mapStreamtapeError(error);
      if(mapped instanceof B2UrlExpiredError){
        await serviceClient().from("media_assets").update({streamtape_status:"not_started",streamtape_last_error:mapped.message.slice(0,500),streamtape_last_checked_at:new Date().toISOString()}).eq("id",asset.id);
        return jsonResponse({code:mapped.code,retry:true,retry_after_seconds:1},409,request);
      }
      const nextAttempts=attempts+1;
      await serviceClient().from("media_assets").update({streamtape_status:"failed",streamtape_attempts:nextAttempts,streamtape_last_error:mapped.message.slice(0,500),streamtape_last_checked_at:new Date().toISOString()}).eq("id",asset.id);
      if(mapped instanceof StreamtapeAuthError) return jsonResponse({code:mapped.code,retry:false},502,request);
      if(mapped instanceof StreamtapeUnavailableError) return jsonResponse({code:mapped.code,retry:true,retry_after_seconds:60},503,request);
      return jsonResponse({code:(mapped as Error & { code?: string }).code ?? mapped.message,retry:nextAttempts<2},422,request);
    }
  }catch(error){
    const code=error instanceof Error?error.message:"streamtape_remote_upload_error";
    return jsonResponse({code},code==="unauthorized"?401:400,request);
  }
});
