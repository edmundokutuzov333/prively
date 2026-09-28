import { serviceClient } from "../_shared/auth.ts";

type FxConfig = {
  url?: string | null;
  base?: string;
  quotes?: string[];
  source?: string;
};

function jsonResponse(body: unknown,status=200) {
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      "Content-Type":"application/json",
      "Cache-Control":"no-store",
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null,{status:204});
  if (request.method !== "POST") return jsonResponse({code:"method_not_allowed"},405);

  try {
    const admin=serviceClient();
    const {data:expectedToken,error:tokenError}=await admin.rpc("financial_secret",{_name:"prively_fx_job_token"});
    if(tokenError || typeof expectedToken!=="string" || !expectedToken) {
      return jsonResponse({code:"fx_job_secret_not_configured"},503);
    }

    const supplied=request.headers.get("x-prively-job-token") ?? "";
    if(supplied.length!==expectedToken.length) return jsonResponse({code:"forbidden"},403);
    let diff=0;
    for(let i=0;i<supplied.length;i+=1) diff |= supplied.charCodeAt(i)^expectedToken.charCodeAt(i);
    if(diff!==0) return jsonResponse({code:"forbidden"},403);

    const {data:setting,error:settingError}=await admin
      .from("platform_settings")
      .select("value")
      .eq("key","fx_rates.config")
      .maybeSingle();

    if(settingError) return jsonResponse({code:"fx_config_lookup_failed"},500);

    const config=(setting?.value ?? {}) as FxConfig;
    const url=typeof config.url==="string" ? config.url.trim() : "";
    const base=(config.base ?? "MZN").toUpperCase();
    const quotes=(config.quotes ?? ["USD","EUR","ZAR"]).map((value)=>value.toUpperCase()).filter((value)=>value!==base);

    if(!url) return jsonResponse({ok:true,skipped:true,reason:"provider_not_configured"});
    if(!/^https:\/\//i.test(url)) return jsonResponse({code:"fx_provider_url_must_be_https"},400);

    const {data:apiKey}=await admin.rpc("financial_secret",{_name:"prively_fx_api_key"});
    const headers:Record<string,string>={"Accept":"application/json"};
    if(typeof apiKey==="string" && apiKey) headers.Authorization="Bearer " + apiKey;

    const response=await fetch(url,{headers});
    if(!response.ok) return jsonResponse({code:`fx_provider_http_${response.status}`},502);

    const body=await response.json() as Record<string,unknown>;
    const ratesValue=body.rates;
    if(!isObject(ratesValue)) return jsonResponse({code:"fx_provider_invalid_rates"},502);

    let inserted=0;
    for(const quote of quotes){
      const raw=ratesValue[quote];
      const rate=typeof raw==="number" ? raw : typeof raw==="string" ? Number(raw) : NaN;
      if(!Number.isFinite(rate) || rate<=0) continue;

      const pairs=[
        {base_currency:base,quote_currency:quote,rate,source:String(config.source ?? "configured_provider")},
        {base_currency:quote,quote_currency:base,rate:1/rate,source:String(config.source ?? "configured_provider")},
      ];

      for(const pair of pairs){
        const {error}=await admin.from("fx_rates").insert(pair);
        if(error) throw new Error("fx_rate_insert_failed");
        inserted+=1;
      }
    }

    if(inserted===0) return jsonResponse({ok:false,code:"fx_provider_no_supported_rates"},422);

    await admin.from("financial_audit_log").insert({
      actor_id:null,
      action:"fx.refresh",
      entity_type:"fx_rates",
      entity_id:null,
      metadata:{
        source:String(config.source ?? "configured_provider"),
        base,
        quotes,
        inserted,
        observed_at:new Date().toISOString(),
      },
    });

    return jsonResponse({ok:true,inserted});
  }catch(error){
    return jsonResponse({code:error instanceof Error ? error.message : "fx_refresh_failed"},500);
  }
});
