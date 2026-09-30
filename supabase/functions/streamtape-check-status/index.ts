import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";
import { fileInfo, mapStreamtapeError, remoteStatus, StreamtapeAuthError, StreamtapeUnavailableError } from "../_shared/streamtape.ts";

Deno.serve(async (request)=>{
  if(request.method==="OPTIONS") return optionsResponse(request);
  if(request.method!=="POST") return jsonResponse({code:"method_not_allowed"},405,request);
  try{
    const token=request.headers.get("x-prively-job-token");
    let admin:ReturnType<typeof serviceClient>, userId:string|null=null;
    if(token){
      admin=serviceClient();
      const {data,error}=await admin.rpc("verify_streamtape_poll_token",{_token:token});
      if(error||data!==true) throw new Error("invalid_job_token");
    }else{
      const {client,user}=await requireUser(request);
      admin=client as ReturnType<typeof serviceClient>;
      userId=user.id;
    }
    const body=await request.json() as {asset_id?:unknown};
    if(typeof body.asset_id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.asset_id)) return jsonResponse({code:"invalid_asset_id"},400,request);

    const {data:asset,error}=await admin.from("media_assets").select("id,channel_id,kind,streamtape_upload_id,streamtape_file_id,streamtape_attempts,streamtape_status").eq("id",body.asset_id).is("deleted_at",null).maybeSingle();
    if(error||!asset) return jsonResponse({code:"media_forbidden"},userId?403:404,request);
    if(String(asset.kind)!=="video") return jsonResponse({code:"streamtape_video_required"},422,request);

    if(userId){
      const {data:channel}=await admin.from("channels").select("owner_id").eq("id",asset.channel_id).maybeSingle();
      if(!channel||String(channel.owner_id)!==userId) return jsonResponse({code:"media_forbidden"},403,request);
    }

    if(typeof asset.streamtape_file_id==="string"&&asset.streamtape_status==="ready")
      return jsonResponse({ok:true,upload_id:asset.streamtape_upload_id,status:"ready",file_id:asset.streamtape_file_id},200,request);

    if(typeof asset.streamtape_upload_id!=="string") return jsonResponse({ok:true,status:"not_started"},200,request);

    try{
      const state=await remoteStatus(asset.streamtape_upload_id);
      if(state.normalizedStatus==="processing"){
        await serviceClient().from("media_assets").update({streamtape_status:"processing",streamtape_last_checked_at:new Date().toISOString(),streamtape_last_error:null}).eq("id",asset.id);
        return jsonResponse({ok:true,upload_id:asset.streamtape_upload_id,status:"processing",provider_status:state.rawStatus},200,request);
      }
      if(state.normalizedStatus==="completed"){
        if(!state.fileId) throw new Error("streamtape_file_id_missing");
        await fileInfo(state.fileId);
        const {error:updateError}=await serviceClient().from("media_assets").update({
          streamtape_status:"ready",streamtape_file_id:state.fileId,streamtape_last_error:null,streamtape_last_checked_at:new Date().toISOString(),streamtape_ready_at:new Date().toISOString()
        }).eq("id",asset.id);
        if(updateError) throw new Error("streamtape_ready_state_update_failed");
        return jsonResponse({ok:true,upload_id:asset.streamtape_upload_id,status:"ready",file_id:state.fileId},200,request);
      }
      await serviceClient().from("media_assets").update({streamtape_status:"failed",streamtape_last_error:(state.message??state.rawStatus).slice(0,500),streamtape_last_checked_at:new Date().toISOString()}).eq("id",asset.id);
      return jsonResponse({ok:false,upload_id:asset.streamtape_upload_id,status:"failed",provider_status:state.rawStatus,code:"streamtape_upload_failed",retry:Number(asset.streamtape_attempts??0)<2},422,request);
    }catch(error){
      const mapped=mapStreamtapeError(error);
      if(mapped instanceof StreamtapeAuthError) return jsonResponse({code:mapped.code,retry:false},502,request);
      if(mapped instanceof StreamtapeUnavailableError){
        await serviceClient().from("media_assets").update({streamtape_last_error:mapped.message.slice(0,500),streamtape_last_checked_at:new Date().toISOString()}).eq("id",asset.id);
        return jsonResponse({code:mapped.code,retry:true,retry_after_seconds:60},503,request);
      }
      await serviceClient().from("media_assets").update({streamtape_status:"failed",streamtape_last_error:mapped.message.slice(0,500),streamtape_last_checked_at:new Date().toISOString()}).eq("id",asset.id);
      return jsonResponse({ok:false,code:mapped.message,retry:Number(asset.streamtape_attempts??0)<2},422,request);
    }
  }catch(error){
    const code=error instanceof Error?error.message:"streamtape_status_error";
    return jsonResponse({code},code==="unauthorized"||code==="invalid_job_token"?401:400,request);
  }
});
