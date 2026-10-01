const platformErrorKeys: Record<string, string> = {
  unauthorized: 'errors.unauthorized',
  forbidden: 'errors.forbidden',
  kyc_documents_required: 'errors.kyc_documents_required',
  kyc_document_not_uploaded: 'errors.kyc_document_not_uploaded',
  kyc_selfie_not_uploaded: 'errors.kyc_selfie_not_uploaded',
  kyc_path_forbidden: 'errors.kyc_path_forbidden',
  kyc_already_pending: 'errors.kyc_already_pending',
  kyc_provider_unverified: 'errors.kyc_provider_unverified',
  invalid_kyc_payload: 'errors.invalid_kyc_payload',
  kyc_not_found: 'errors.kyc_not_found',
  file_too_large: 'errors.file_too_large',
  insufficient_funds: 'errors.insufficient_funds',
  age_not_verified: 'errors.age_not_verified',
  channel_not_found: 'errors.channel_not_found',
  self_purchase_not_allowed: 'errors.self_purchase_not_allowed',
  invalid_spend_request: 'errors.invalid_spend_request',
  idempotency_key_required: 'errors.idempotency_key_required',
  daily_spend_limit: 'errors.daily_spend_limit',
  weekly_spend_limit: 'errors.weekly_spend_limit',
  monthly_spend_limit: 'errors.monthly_spend_limit',
};

function codeFromUnknown(error: unknown): string {
  if (typeof error === 'string') return error.split(':')[0].trim();
  if (error instanceof Error) return error.message.split(':')[0].trim();
  if (typeof error === 'object' && error !== null) {
    const maybe = error as { code?: unknown; message?: unknown };
    if (typeof maybe.code === 'string') return maybe.code;
    if (typeof maybe.message === 'string') return maybe.message.split(':')[0].trim();
  }
  return 'generic';
}

export function platformErrorKey(error: unknown): string {
  return platformErrorKeys[codeFromUnknown(error)] ?? 'errors.generic';
}
