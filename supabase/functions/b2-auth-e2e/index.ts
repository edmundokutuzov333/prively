import { createClient } from "npm:@supabase/supabase-js@2";
import { DeleteObjectCommand } from "npm:@aws-sdk/client-s3@3.1142.0";
import { b2Bucket, b2Client } from "../_shared/b2.ts";

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error("missing_env:" + name);
  return value;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

Deno.serve(async (request) => {
  let stage = "bootstrap";
  try {
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const anon = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const suffix = crypto.randomUUID();
    const email = "b2-auth-e2e-" + suffix + "@example.test";
    const password = "B2AuthE2E-" + suffix + "!";
    const userResult = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        handle: "b2e2e" + suffix.slice(0, 8),
        display_name: "B2 B2 E2E",
        signup_role: "creator",
      },
    });
    if (userResult.error || !userResult.data.user) throw userResult.error ?? new Error("user_create_failed");

    const userId = userResult.data.user.id;
    let channelId = "";
    let postId = "";
    let assetId = "";
    let uploadId = "";
    let objectPath = "";

    try {
      await admin.from("legal_acceptances").insert({
        user_id: userId,
        document_type: "content_prohibited",
        version: "1.0",
        source: "b2-auth-e2e",
        metadata: { test: true },
      });

      channelId = crypto.randomUUID();
      postId = crypto.randomUUID();

      const channel = await admin.from("channels").insert({
        id: channelId,
        owner_id: userId,
        handle: "b2e2e" + suffix.slice(0, 8),
        display_name: "B2 E2E Creator",
        dm_mode: "off",
      });
      if (channel.error) throw channel.error;

      const post = await admin.from("posts").insert({
        id: postId,
        channel_id: channelId,
        caption: "B2 authenticated E2E",
        visibility: "public",
        status: "draft",
        publish_at: new Date().toISOString(),
        is_story: false,
        watermark_enabled: true,
        moderation_status: "clean",
      });
      if (post.error) throw post.error;

      const signIn = await anon.auth.signInWithPassword({ email, password });
      if (signIn.error || !signIn.data.session) throw signIn.error ?? new Error("signin_failed");
      const accessToken = signIn.data.session.access_token;

      const baseUrl = env("SUPABASE_URL") + "/functions/v1";
      const png = new Uint8Array([
        137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,
        0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222,
        0,0,0,12,73,68,65,84,8,215,99,248,207,192,240,
        31,0,5,0,1,255,137,153,61,29,0,0,0,0,73,
        69,78,68,174,66,96,130
      ]);

      const prepare = await fetch(baseUrl + "/create-media-upload", {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          postId,
          kind: "image",
          mimeType: "image/png",
          fileSize: png.byteLength,
          originalFilename: "b2-auth-e2e.png",
          participantsConsent: true,
        }),
      });
      const plan = await prepare.json();
      if (!prepare.ok) throw new Error("create_media_upload_" + prepare.status + ":" + JSON.stringify(plan));

      uploadId = String(plan.uploadId);
      assetId = String(plan.assetId);
      objectPath = String(plan.path);

      const uploadResponse = await fetch(String(plan.uploadUrl), {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: png,
      });
      if (!uploadResponse.ok) throw new Error("b2_upload_" + uploadResponse.status);

      const finalize = await anon.rpc("finalize_media_upload", {
        _upload: uploadId,
        _reported_sha256: null,
        _file_size: png.byteLength,
      });
      if (finalize.error || !finalize.data) throw finalize.error ?? new Error("finalize_failed");

      const access = await fetch(baseUrl + "/get-media-url", {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, variant: "original" }),
      });
      const accessBody = await access.json();
      if (!access.ok) throw new Error("get_media_url_" + access.status + ":" + JSON.stringify(accessBody));

      const download = await fetch(String(accessBody.url));
      const bytes = new Uint8Array(await download.arrayBuffer());
      const contentMatches = download.ok &&
        bytes.length === png.length &&
        bytes.every((value, index) => value === png[index]);

      const assetRow = await admin.from("media_assets")
        .select("storage_provider,metadata")
        .eq("id", assetId)
        .single();

      return json({
        ok: contentMatches &&
          assetRow.data?.storage_provider === "backblaze_b2" &&
          accessBody.source === "backblaze_b2" &&
          accessBody.expiresIn === 60,
        provider: "backblaze_b2",
        bucket: b2Bucket(),
        userId,
        assetId,
        uploadId,
        path: objectPath,
        createMediaUploadStatus: prepare.status,
        uploadStatus: uploadResponse.status,
        finalizeStatus: 200,
        getMediaUrlStatus: access.status,
        downloadStatus: download.status,
        contentMatches,
        storageProvider: assetRow.data?.storage_provider ?? null,
        source: accessBody.source ?? null,
        expiresIn: accessBody.expiresIn ?? null,
      });
    } finally {
      if (objectPath) {
        try {
          await b2Client().send(new DeleteObjectCommand({
            Bucket: b2Bucket(),
            Key: objectPath,
          }));
        } catch {}
      }

      if (assetId) {
        await admin.from("media_access_logs").delete().eq("asset_id", assetId);
        await admin.from("media_consents").delete().eq("asset_id", assetId);
        await admin.from("media_uploads").delete().eq("id", uploadId);
        await admin.from("media_assets").delete().eq("id", assetId);
      }
      if (postId) await admin.from("posts").delete().eq("id", postId);
      if (channelId) await admin.from("channels").delete().eq("id", channelId);
      await admin.from("legal_acceptances").delete().eq("user_id", userId);
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.from("security_events").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  } catch (error) {
    return json({
      ok: false,
      stage,
      code: error instanceof Error ? error.message : "b2_auth_e2e_failed",
    }, 502);
  }
});
