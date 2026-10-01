/* global process, console */
import { readdirSync, readFileSync } from 'node:fs';

const dir = 'supabase/migrations';
const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();
const seenVersions = new Map();
const seenNames = new Map();
const errors = [];
let noop = 0;

// Historical logical-name duplicates are documented in docs/migrations-audit-2026-10-01.md.
// They remain immutable history. Any NEW logical-name duplicate must fail CI.
const historicalDuplicateNames = new Set([
  "admin_authorization",
  "phase4_admin_security_queries",
  "phase4_fix_self_exclusion_function",
  "phase4_function_public_grant_hardening",
  "phase4_identity_access_security_core",
  "phase4_identity_access_security_policies",
  "phase4_require_aal2_for_kyc_admin_action",
  "phase4_revoke_anon_security_definers",
  "phase4_security_definer_execute_allowlist",
  "phase4_security_rls_helper_allowlist",
  "phase5_admin_media_access",
  "phase5_archive_publication_events",
  "phase5_blurhash_and_media_size_hardening",
  "phase5_compliance_archive_and_server_hash",
  "phase5_content_media_engine",
  "phase5_content_media_hardening",
  "phase5_disable_unverified_dispatch",
  "phase5_drop_duplicate_media_job_index",
  "phase5_finalize_media_jobs_hardening",
  "phase5_finalize_returns_job_ids",
  "phase5_fix_legal_acceptance_ambiguity",
  "phase5_media_processing_queue",
  "phase5_media_visibility_gate",
  "phase5_processing_access_audit",
  "phase5_processing_upload_hardening",
  "phase5_remove_admin_storage_read_bypass",
  "phase5_resumable_session_reuse",
  "phase5_retention_setting_contract",
  "phase5_safe_locked_preview",
  "phase5_security_advisor_hardening",
  "phase6_concurrent_financial_intents",
  "phase6_finance_reconciliation_rpc",
  "phase6_financial_aal2_and_spend_limits",
  "phase6_financial_rpc_grants_hardening",
  "phase6_financial_ui_contracts",
  "phase6_fx_refresh_worker",
  "phase6_ledger_invariants",
  "phase6_payment_worker_grants",
  "phase6_payout_encryption_qualification",
  "phase6_payout_recent_mfa",
  "phase6_subscription_idempotency",
  "phase7_access_contract_hardening",
  "phase7_live_room_contract",
  "phase7_push_delivery_contract",
  "phase7_realtime_topic_split",
  "phase7_relation_indexes",
  "phase7_rls_block_oracle_hardening",
  "phase7_security_lint_cleanup",
  "phase7_security_performance_hardening",
  "phase7_social_realtime_communication"
]);

for (const file of files) {
  const match = /^(\d{14})_([a-z0-9_]+)\.sql$/.exec(file);
  if (!match) {
    errors.push(`Nome inválido: ${file}`);
    continue;
  }
  const [, version, logicalName] = match;
  if (seenVersions.has(version)) errors.push(`Versão duplicada ${version}: ${seenVersions.get(version)} e ${file}`);
  seenVersions.set(version, file);

  const prior = seenNames.get(logicalName);
  if (prior && !historicalDuplicateNames.has(logicalName)) {
    errors.push(`Nome lógico duplicado novo ${logicalName}: ${prior} e ${file}. Crie um nome/proposito novo.`);
  }
  seenNames.set(logicalName, file);

  if (/intentionally performs no schema/i.test(readFileSync(`${dir}/${file}`, 'utf8'))) noop += 1;
}

const historicalNoopBudget = 61;
if (noop > historicalNoopBudget) errors.push(`Novas migrações no-op: ${noop} > ${historicalNoopBudget}`);

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`OK: ${files.length} migrações; sem versões duplicadas; ${historicalDuplicateNames.size} nomes lógicos históricos allowlisted; ${noop} marcadores históricos.`);
