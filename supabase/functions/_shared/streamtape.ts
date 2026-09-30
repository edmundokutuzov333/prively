const BASE_URL = "https://api.streamtape.com";

export class StreamtapeConfigurationError extends Error { readonly code="streamtape_configuration_error"; }
export class StreamtapeAuthError extends Error { readonly code="streamtape_auth_error"; }
export class StreamtapeUnavailableError extends Error { readonly code="streamtape_unavailable"; }
export class StreamtapeRejectedError extends Error { readonly code="streamtape_rejected"; }
export class StreamtapeUploadFailedError extends Error { readonly code="streamtape_upload_failed"; }
export class B2UrlExpiredError extends Error { readonly code="b2_url_expired"; }

type Envelope={status?:unknown;msg?:unknown;result?:unknown};
export type RemoteUploadResult={id:string};
export type RemoteStatus={rawStatus:string; normalizedStatus:"processing"|"completed"|"failed"; fileId:string|null; name:string|null; size:number|null; message:string|null};

function env(name:string):string {
  const v=Deno.env.get(name)?.trim();
  if(!v) throw new StreamtapeConfigurationError(`missing_env:${name}`);
  return v;
}
function msg(v:unknown):string {
  return v && typeof v==="object" && "msg" in v ? String((v as Record<string,unknown>).msg??"") : typeof v==="string" ? v : "";
}
function classify(http:number, api:number, text:string, op:string):Error {
  const s=text.toLowerCase();
  if(/expired|signature.*(?:expired|invalid)|request has expired|presigned.*expired|accessdenied.*expired/.test(s)) return new B2UrlExpiredError("b2_url_expired");
  if(http===401||http===403||api===403||/invalid.?key|invalid.?login|authentication|unauthori|forbidden|permission denied/.test(s)) return new StreamtapeAuthError("streamtape_auth_error");
  if([429,509,500,502,503,504].includes(http)||[429,509,500,502,503,504].includes(api)||/timeout|temporar|rate.?limit|bandwidth usage exceeded|network/.test(s)) return new StreamtapeUnavailableError("streamtape_unavailable");
  if(http===451||api===451) return new StreamtapeRejectedError(text||"streamtape_rejected");
  if(op==="remote-upload"&&(http===400||api===400||http===404||api===404||/invalid|reject|unsupported|remote url|source/.test(s))) return new StreamtapeRejectedError(text||"streamtape_rejected");
  return op==="remote-upload" ? new StreamtapeUploadFailedError(text||"streamtape_upload_failed") : new StreamtapeRejectedError(text||"streamtape_request_failed");
}
async function request<T extends Envelope>(path:string, params:Record<string,string|undefined>, op:string):Promise<T>{
  const u=new URL(BASE_URL+path);
  for(const [k,v] of Object.entries(params)) if(v!==undefined&&v!=="") u.searchParams.set(k,v);
  const c=new AbortController();
  const timer=setTimeout(()=>c.abort(),20000);
  let response:Response;
  try{response=await fetch(u,{method:"GET",signal:c.signal,headers:{Accept:"application/json"}});}
  catch(e){clearTimeout(timer); if(e instanceof DOMException&&e.name==="AbortError") throw new StreamtapeUnavailableError("streamtape_request_timeout"); throw new StreamtapeUnavailableError("streamtape_network_error");}
  clearTimeout(timer);
  let body:T;
  try{body=await response.json() as T;}catch{throw new StreamtapeUnavailableError("streamtape_invalid_json");}
  const api=Number(body.status??response.status);
  if(!response.ok||api!==200) throw classify(response.status,api,msg(body),op);
  return body;
}
function credentials(){return {login:env("STREAMTAPE_API_USERNAME"),key:env("STREAMTAPE_API_PASSWORD")};}
export async function remoteUpload(sourceUrl:string,folderId?:string,name?:string):Promise<RemoteUploadResult>{
  const {login,key}=credentials();
  const b=await request<Envelope>("/remotedl/add",{login,key,url:sourceUrl,folder:folderId,name},"remote-upload");
  const id=b.result&&typeof b.result==="object"?String((b.result as Record<string,unknown>).id??""):"";
  if(!id) throw new StreamtapeUploadFailedError("streamtape_upload_id_missing");
  return {id};
}
function norm(s:string):"processing"|"completed"|"failed"{
  const v=s.toLowerCase();
  if(["completed","complete","finished","done","converted"].includes(v)) return "completed";
  if(["failed","error","rejected","cancelled","canceled"].includes(v)) return "failed";
  return "processing";
}
function fileId(r:Record<string,unknown>):string|null{
  for(const k of ["fileid","file_id","linkid","extid","file"]){const v=r[k]; if(typeof v==="string"&&v&&v!=="false") return v;}
  const u=r.url; if(typeof u==="string"&&u){const m=u.match(/\/v\/([^/]+)/i)??u.match(/\/e\/([^/]+)/i); if(m?.[1]) return m[1];}
  return null;
}
export async function remoteStatus(uploadId:string):Promise<RemoteStatus>{
  const {login,key}=credentials();
  const b=await request<Envelope>("/remotedl/status",{login,key,id:uploadId},"status");
  const obj=b.result&&typeof b.result==="object"?((b.result as Record<string,unknown>)[uploadId]??b.result):null;
  if(!obj||typeof obj!=="object") throw new StreamtapeUploadFailedError("streamtape_status_result_missing");
  const r=obj as Record<string,unknown>, raw=String(r.status??"processing");
  return {rawStatus:raw,normalizedStatus:norm(raw),fileId:fileId(r),name:typeof r.name==="string"?r.name:null,size:typeof r.size==="number"?r.size:null,message:typeof r.msg==="string"?r.msg:null};
}
export async function fileInfo(id:string):Promise<Record<string,unknown>>{
  const {login,key}=credentials();
  const b=await request<Envelope>("/file/info",{login,key,file:id},"file-info");
  if(!b.result||typeof b.result!=="object") throw new StreamtapeRejectedError("streamtape_file_info_missing");
  return b.result as Record<string,unknown>;
}
export function embedUrl(id:string):string{
  if(!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("invalid_streamtape_file_id");
  return `https://streamtape.com/e/${encodeURIComponent(id)}`;
}
export function mapStreamtapeError(e:unknown):Error{
  if(e instanceof StreamtapeAuthError||e instanceof StreamtapeUnavailableError||e instanceof StreamtapeRejectedError||e instanceof StreamtapeUploadFailedError||e instanceof StreamtapeConfigurationError||e instanceof B2UrlExpiredError) return e;
  return e instanceof Error?e:new Error("streamtape_request_failed");
}
