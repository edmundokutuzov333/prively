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
  kyc_pending: 'errors.kyc_pending',
  kyc_required: 'errors.kyc_required',
  role_check_failed: 'errors.role_check_failed',
  age_verification_unavailable: 'errors.age_verification_unavailable',
  kyc_status_unavailable: 'errors.kyc_status_unavailable',
  file_too_large: 'errors.file_too_large',
  insufficient_funds: 'errors.insufficient_funds',
  age_not_verified: 'errors.age_not_verified',
  channel_not_found: 'errors.channel_not_found',
  self_purchase_not_allowed: 'errors.self_purchase_not_allowed',
  invalid_spend_request: 'errors.invalid_spend_request',
  idempotency_key_required: 'errors.idempotency_key_required',
  tier_rank_invalid: 'errors.tier_rank_invalid',
  tier_name_invalid: 'errors.tier_name_invalid',
  tier_price_invalid: 'errors.tier_price_invalid',
  tier_discounts_invalid: 'errors.tier_discounts_invalid',
  tier_one_month_discount_invalid: 'errors.tier_one_month_discount_invalid',
  channel_forbidden: 'errors.channel_forbidden',
  subscription_not_found: 'errors.subscription_not_found',
  daily_spend_limit: 'errors.daily_spend_limit',
  weekly_spend_limit: 'errors.weekly_spend_limit',
  monthly_spend_limit: 'errors.monthly_spend_limit',
  invalid_ppv_request: 'errors.invalid_ppv_request',
  post_not_found: 'errors.post_not_found',
  ppv_not_available: 'errors.ppv_not_available',
  ppv_purchase_record_failed: 'errors.ppv_purchase_record_failed',
  financial_export_failed: 'errors.financial_export_failed',
  receipt_not_found: 'errors.receipt_not_found',
  invalid_receipt_id: 'errors.invalid_receipt_id',
  session_required: 'errors.unauthorized',
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
