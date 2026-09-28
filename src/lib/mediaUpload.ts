import * as tus from 'tus-js-client';
import { requireSupabase, supabaseProjectRef } from '@/lib/supabase';

export type MediaUploadPlan = {
  uploadId: string;
  assetId: string;
  path: string;
  bucket: 'prively-private';
  expiresAt: string;
};

export type MediaUploadProgress = {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
};

const TUS_ENDPOINT = `https://${supabaseProjectRef}.storage.supabase.co/storage/v1/upload/resumable`;
const CHUNK_SIZE = 6 * 1024 * 1024;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return toHex(new Uint8Array(digest));
}

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
): Promise<{ plan: MediaUploadPlan; sha256: string }> {
  const sb = requireSupabase();
  const digest = await sha256(file);
  const { data, error } = await sb.rpc('create_media_upload', {
    _post: postId,
    _kind: kindForMime(file.type),
    _mime_type: file.type,
    _file_size: file.size,
    _sha256: digest,
    _original_filename: file.name,
  });
  if (error || !data) throw new Error(error?.message ?? 'media_upload_prepare_failed');

  return {
    plan: {
      uploadId: String(data.uploadId),
      assetId: String(data.assetId),
      path: String(data.path),
      bucket: 'prively-private',
      expiresAt: String(data.expiresAt),
    },
    sha256: digest,
  };
}

export async function uploadMediaResumable(
  file: File,
  plan: MediaUploadPlan,
  digest: string,
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
      onError: (error) => reject(error),
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
        if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
        upload.start();
      })
      .catch(reject);
  });

  const { error: finalizeError } = await sb.rpc('finalize_media_upload', {
    _upload: plan.uploadId,
    _reported_sha256: digest,
    _file_size: file.size,
  });

  if (finalizeError) throw new Error(finalizeError.message);
}
