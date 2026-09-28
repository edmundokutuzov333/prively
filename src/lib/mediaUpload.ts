import * as tus from 'tus-js-client';
import { requireSupabase, supabaseProjectRef } from '@/lib/supabase';

export type MediaUploadPlan = {
  uploadId: string;
  assetId: string;
  path: string;
  bucket: 'prively-private';
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
): Promise<MediaUploadPlan> {
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('create_media_upload', {
    _post: postId,
    _kind: kindForMime(file.type),
    _mime_type: file.type,
    _file_size: file.size,
    _sha256: null,
    _original_filename: file.name,
  });

  if (error || !data) {
    throw new Error(error?.message ?? 'media_upload_prepare_failed');
  }

  return {
    uploadId: String(data.uploadId),
    assetId: String(data.assetId),
    path: String(data.path),
    bucket: 'prively-private',
    expiresAt: String(data.expiresAt),
  };
}

export async function uploadMediaResumable(
  file: File,
  plan: MediaUploadPlan,
  onProgress?: (progress: MediaUploadProgress) => void,
): Promise<MediaFinalizeResult> {
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

  const { data: finalizeData, error: finalizeError } = await sb.rpc('finalize_media_upload', {
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
