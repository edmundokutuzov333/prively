import * as tus from 'tus-js-client';
import { requireSupabase, supabaseProjectRef } from '@/lib/supabase';

export type MediaUploadPlan = {
  uploadId: string;
  assetId: string;
  path: string;
  key: string;
  bucket: string;
  provider: 'supabase' | 'backblaze_b2';
  uploadUrl?: string;
  uploadHeaders?: Record<string, string>;
  expiresAt: string;
};

export type MediaProcessingJobs = {
  integrity: string | null;
  archive: string | null;
  moderation: string | null;
  thumbnail: string | null;
  watermark: string | null;
  hls: string | null;
};

export type MediaFinalizeResult = {
  assetId: string;
  status: string;
  jobs: MediaProcessingJobs;
};

export type MediaUploadProgress = {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
};

const TUS_ENDPOINT = `https://${supabaseProjectRef}.storage.supabase.co/storage/v1/upload/resumable`;
const CHUNK_SIZE = 6 * 1024 * 1024;

function kindForMime(mimeType: string): 'image' | 'video' | 'audio' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  throw new Error('unsupported_media_type');
}

export function mediaKind(file: File) {
  return kindForMime(file.type);
}

export async function prepareMediaUpload(
  postId: string,
  file: File,
  participantsConsent: boolean,
): Promise<MediaUploadPlan> {
  const sb = requireSupabase();
  const { data, error } = await sb.functions.invoke('create-media-upload', {
    body: {
      postId,
      kind: kindForMime(file.type),
      mimeType: file.type,
      fileSize: file.size,
      originalFilename: file.name,
      participantsConsent,
    },
  });

  if (error || !data) {
    throw new Error(error?.message ?? 'media_upload_prepare_failed');
  }

  if (
    typeof data.uploadId !== 'string' ||
    typeof data.assetId !== 'string' ||
    typeof data.path !== 'string' ||
    typeof data.uploadUrl !== 'string' ||
    typeof data.expiresAt !== 'string'
  ) {
    throw new Error('media_upload_plan_invalid');
  }

  const provider = data.provider === 'backblaze_b2' || data.provider === 'supabase'
    ? data.provider
    : 'backblaze_b2';

  const uploadHeaders = typeof data.uploadHeaders === 'object' && data.uploadHeaders
    ? Object.fromEntries(Object.entries(data.uploadHeaders).map(([key, value]) => [key, String(value)]))
    : undefined;

  if (provider === 'backblaze_b2' && uploadHeaders?.['Content-Type'] !== file.type) {
    throw new Error('media_upload_content_type_mismatch');
  }

  return {
    uploadId: data.uploadId,
    assetId: data.assetId,
    path: data.path,
    key: String(data.key ?? data.path),
    bucket: String(data.bucket ?? (provider === 'backblaze_b2' ? 'prively-media-originals-2026' : 'prively-private')),
    provider,
    uploadUrl: data.uploadUrl,
    uploadHeaders: provider === 'backblaze_b2' ? uploadHeaders : undefined,
    expiresAt: data.expiresAt,
  };
}

async function uploadDirectToB2(
  file: File,
  plan: MediaUploadPlan,
  onProgress?: (progress: MediaUploadProgress) => void,
): Promise<void> {
  if (!plan.uploadUrl || !plan.uploadHeaders) {
    throw new Error('media_upload_plan_invalid');
  }

  const signedContentType = plan.uploadHeaders['Content-Type'];
  if (signedContentType !== file.type) {
    throw new Error('media_upload_content_type_mismatch');
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', plan.uploadUrl!);
    xhr.timeout = 5 * 60 * 1000;

    for (const [key, value] of Object.entries(plan.uploadHeaders!)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({
        uploadedBytes: event.loaded,
        totalBytes: event.total,
        percentage: event.total ? (event.loaded / event.total) * 100 : 0,
      });
    };

    xhr.onerror = () => reject(new Error('b2_upload_network_error'));
    xhr.ontimeout = () => reject(new Error('b2_upload_timeout'));
    xhr.onabort = () => reject(new Error('b2_upload_aborted'));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({
          uploadedBytes: file.size,
          totalBytes: file.size,
          percentage: 100,
        });
        resolve();
        return;
      }
      reject(new Error(`b2_upload_failed_${xhr.status}`));
    };

    xhr.send(file);
  });
}

async function uploadToSupabaseResumable(
  file: File,
  plan: MediaUploadPlan,
  onProgress?: (progress: MediaUploadProgress) => void,
): Promise<void> {
  const sb = requireSupabase();
  const { data: signedData, error: signedError } = await sb.storage
    .from('prively-private')
    .createSignedUploadUrl(plan.path, { upsert: false });

  if (signedError || !signedData?.token) {
    throw new Error(signedError?.message ?? 'signed_upload_url_failed');
  }

  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error(sessionError?.message ?? 'session_required');
  }

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: TUS_ENDPOINT,
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${sessionData.session.access_token}`,
        'x-signature': signedData.token,
      },
      metadata: {
        bucketName: 'prively-private',
        objectName: plan.path,
        contentType: file.type,
        cacheControl: '3600',
      },
      onError: (uploadError) => reject(uploadError),
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress?.({
          uploadedBytes: bytesUploaded,
          totalBytes: bytesTotal,
          percentage: bytesTotal ? (bytesUploaded / bytesTotal) * 100 : 0,
        });
      },
      onSuccess: () => resolve(),
    });

    void upload.findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      })
      .catch(reject);
  });
}

export async function uploadMediaResumable(
  file: File,
  plan: MediaUploadPlan,
  onProgress?: (progress: MediaUploadProgress) => void,
): Promise<MediaFinalizeResult> {
  if (plan.provider === 'backblaze_b2') {
    await uploadDirectToB2(file, plan, onProgress);
  } else {
    await uploadToSupabaseResumable(file, plan, onProgress);
  }

  const { data: finalizeData, error: finalizeError } = await requireSupabase().rpc('finalize_media_upload', {
    _upload: plan.uploadId,
    _reported_sha256: null,
    _file_size: file.size,
  });

  if (finalizeError || !finalizeData) {
    throw new Error(finalizeError?.message ?? 'media_finalize_failed');
  }

  const jobs = (finalizeData.jobs ?? {}) as Record<string, unknown>;

  return {
    assetId: String(finalizeData.assetId),
    status: String(finalizeData.status ?? 'queued'),
    jobs: {
      integrity: typeof jobs.integrity === 'string' ? jobs.integrity : null,
      archive: typeof jobs.archive === 'string' ? jobs.archive : null,
      moderation: typeof jobs.moderation === 'string' ? jobs.moderation : null,
      thumbnail: typeof jobs.thumbnail === 'string' ? jobs.thumbnail : null,
      watermark: typeof jobs.watermark === 'string' ? jobs.watermark : null,
      hls: typeof jobs.hls === 'string' ? jobs.hls : null,
    },
  };
}


export type StreamtapeRemoteUploadResult = {
  ok: boolean;
  uploadId: string | null;
  status: "queued" | "processing" | "ready";
  fileId?: string;
  embedUrl?: string;
};

export async function startStreamtapeRemoteUpload(
  assetId: string,
  folderId?: string,
): Promise<StreamtapeRemoteUploadResult> {
  const body: Record<string, string> = { asset_id: assetId };
  if (folderId) body.folder_id = folderId;
  const { data, error } = await requireSupabase().functions.invoke(
    "streamtape-remote-upload",
    { body },
  );
  if (data?.code === "media_not_ready") {
    return {
      ok: true,
      uploadId: null,
      status: "queued",
    };
  }

  if (error || !data?.ok || typeof data.upload_id !== "string") {
    throw new Error(
      typeof data?.code === "string"
        ? data.code
        : error?.message ?? "streamtape_upload_failed",
    );
  }
  return {
    ok: true,
    uploadId: data.upload_id,
    status: data.status === "ready" ? "ready" : "processing",
    fileId: typeof data.file_id === "string" ? data.file_id : undefined,
    embedUrl: typeof data.embed_url === "string" ? data.embed_url : undefined,
  };
}
