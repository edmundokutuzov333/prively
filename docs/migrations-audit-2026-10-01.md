# Migration audit 2026-10-01

## Snapshot

- Local migration files: 208
- Remote migration versions: 206
- Common version prefixes: 0
- Local-only version prefixes: 20
- Remote-only version prefixes: 18
- Logical duplicate-name pairs: 50

## Rule

Nenhuma migração aplicada foi editada ou apagada. Os 50 pares foram comparados pelo conteúdo do ficheiro. Todos apresentaram conteúdo materialmente diferente entre os dois timestamps, por isso a classificação é DIVERGENTE e não REDUNDANTE. A divergência é histórica: em vários casos uma versão curta/placeholder foi seguida por uma implementação completa; noutros houve reexecução/renumeração com conteúdo diferente. Não é seguro apagar nenhum dos ficheiros aplicado. A sequência deve permanecer forward-only.

## Pares classificados

### admin_authorization

- 20260928130924_admin_authorization.sql ↔ 20260928140000_admin_authorization.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase4_admin_security_queries

- 20260928141052_phase4_admin_security_queries.sql ↔ 20260928150200_phase4_admin_security_queries.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase4_fix_self_exclusion_function

- 20260928142655_phase4_fix_self_exclusion_function.sql ↔ 20260928150700_phase4_fix_self_exclusion_function.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase4_function_public_grant_hardening

- 20260928142209_phase4_function_public_grant_hardening.sql ↔ 20260928150600_phase4_function_public_grant_hardening.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase4_identity_access_security_core

- 20260928140854_phase4_identity_access_security_core.sql ↔ 20260928150000_phase4_identity_access_security_core.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase4_identity_access_security_policies

- 20260928140907_phase4_identity_access_security_policies.sql ↔ 20260928150100_phase4_identity_access_security_policies.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase4_require_aal2_for_kyc_admin_action

- 20260928142929_phase4_require_aal2_for_kyc_admin_action.sql ↔ 20260928150800_phase4_require_aal2_for_kyc_admin_action.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase4_revoke_anon_security_definers

- 20260928142128_phase4_revoke_anon_security_definers.sql ↔ 20260928150500_phase4_revoke_anon_security_definers.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase4_security_definer_execute_allowlist

- 20260928141743_phase4_security_definer_execute_allowlist.sql ↔ 20260928150300_phase4_security_definer_execute_allowlist.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase4_security_rls_helper_allowlist

- 20260928142045_phase4_security_rls_helper_allowlist.sql ↔ 20260928150400_phase4_security_rls_helper_allowlist.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_admin_media_access

- 20260928143949_phase5_admin_media_access.sql ↔ 20260928160300_phase5_admin_media_access.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_archive_publication_events

- 20260928152347_phase5_archive_publication_events.sql ↔ 20260928162300_phase5_archive_publication_events.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_blurhash_and_media_size_hardening

- 20260928144508_phase5_blurhash_and_media_size_hardening.sql ↔ 20260928160500_phase5_blurhash_and_media_size_hardening.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_compliance_archive_and_server_hash

- 20260928210000_phase5_compliance_archive_and_server_hash.sql ↔ 20260928215559_phase5_compliance_archive_and_server_hash.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_content_media_engine

- 20260928143616_phase5_content_media_engine.sql ↔ 20260928160000_phase5_content_media_engine.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_content_media_hardening

- 20260928143647_phase5_content_media_hardening.sql ↔ 20260928160100_phase5_content_media_hardening.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_disable_unverified_dispatch

- 20260928213500_phase5_disable_unverified_dispatch.sql ↔ 20260928220157_phase5_disable_unverified_dispatch.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_drop_duplicate_media_job_index

- 20260928220938_phase5_drop_duplicate_media_job_index.sql ↔ 20260928222000_phase5_drop_duplicate_media_job_index.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_finalize_media_jobs_hardening

- 20260928152009_phase5_finalize_media_jobs_hardening.sql ↔ 20260928162100_phase5_finalize_media_jobs_hardening.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_finalize_returns_job_ids

- 20260928220500_phase5_finalize_returns_job_ids.sql ↔ 20260928220713_phase5_finalize_returns_job_ids.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_fix_legal_acceptance_ambiguity

- 20260928145353_phase5_fix_legal_acceptance_ambiguity.sql ↔ 20260928160700_phase5_fix_legal_acceptance_ambiguity.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_media_processing_queue

- 20260928144001_phase5_media_processing_queue.sql ↔ 20260928160400_phase5_media_processing_queue.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_media_visibility_gate

- 20260928143713_phase5_media_visibility_gate.sql ↔ 20260928160200_phase5_media_visibility_gate.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_processing_access_audit

- 20260928210500_phase5_processing_access_audit.sql ↔ 20260928215639_phase5_processing_access_audit.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_processing_upload_hardening

- 20260928151643_phase5_processing_upload_hardening.sql ↔ 20260928162000_phase5_processing_upload_hardening.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_remove_admin_storage_read_bypass

- 20260928152208_phase5_remove_admin_storage_read_bypass.sql ↔ 20260928162200_phase5_remove_admin_storage_read_bypass.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_resumable_session_reuse

- 20260928214000_phase5_resumable_session_reuse.sql ↔ 20260928220223_phase5_resumable_session_reuse.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_retention_setting_contract

- 20260928220911_phase5_retention_setting_contract.sql ↔ 20260928221500_phase5_retention_setting_contract.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_safe_locked_preview

- 20260928215000_phase5_safe_locked_preview.sql ↔ 20260928220411_phase5_safe_locked_preview.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase5_security_advisor_hardening

- 20260928145123_phase5_security_advisor_hardening.sql ↔ 20260928160600_phase5_security_advisor_hardening.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase6_concurrent_financial_intents

- 20260928222459_phase6_concurrent_financial_intents.sql ↔ 20260929001500_phase6_concurrent_financial_intents.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase6_finance_reconciliation_rpc

- 20260928222336_phase6_finance_reconciliation_rpc.sql ↔ 20260929000500_phase6_finance_reconciliation_rpc.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase6_financial_aal2_and_spend_limits

- 20260928221954_phase6_financial_aal2_and_spend_limits.sql ↔ 20260928232500_phase6_financial_aal2_and_spend_limits.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase6_financial_rpc_grants_hardening

- 20260928222956_phase6_financial_rpc_grants_hardening.sql ↔ 20260929005000_phase6_financial_rpc_grants_hardening.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase6_financial_ui_contracts

- 20260928222237_phase6_financial_ui_contracts.sql ↔ 20260928235500_phase6_financial_ui_contracts.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase6_fx_refresh_worker

- 20260928222548_phase6_fx_refresh_worker.sql ↔ 20260929002500_phase6_fx_refresh_worker.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase6_ledger_invariants

- 20260928222151_phase6_ledger_invariants.sql ↔ 20260928233500_phase6_ledger_invariants.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase6_payment_worker_grants

- 20260928221926_phase6_payment_worker_grants.sql ↔ 20260928232000_phase6_payment_worker_grants.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase6_payout_encryption_qualification

- 20260928222219_phase6_payout_encryption_qualification.sql ↔ 20260928234500_phase6_payout_encryption_qualification.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase6_payout_recent_mfa

- 20260928223118_phase6_payout_recent_mfa.sql ↔ 20260929010500_phase6_payout_recent_mfa.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase6_subscription_idempotency

- 20260928222919_phase6_subscription_idempotency.sql ↔ 20260929004000_phase6_subscription_idempotency.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase7_access_contract_hardening

- 20260928225708_phase7_access_contract_hardening.sql ↔ 20260929024000_phase7_access_contract_hardening.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase7_live_room_contract

- 20260928225222_phase7_live_room_contract.sql ↔ 20260929022000_phase7_live_room_contract.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase7_push_delivery_contract

- 20260928225822_phase7_push_delivery_contract.sql ↔ 20260929030000_phase7_push_delivery_contract.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase7_realtime_topic_split

- 20260928225754_phase7_realtime_topic_split.sql ↔ 20260929025000_phase7_realtime_topic_split.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase7_relation_indexes

- 20260928230541_phase7_relation_indexes.sql ↔ 20260929034000_phase7_relation_indexes.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase7_rls_block_oracle_hardening

- 20260928225635_phase7_rls_block_oracle_hardening.sql ↔ 20260929023000_phase7_rls_block_oracle_hardening.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase7_security_lint_cleanup

- 20260928230051_phase7_security_lint_cleanup.sql ↔ 20260929032000_phase7_security_lint_cleanup.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase7_security_performance_hardening

- 20260928225141_phase7_security_performance_hardening.sql ↔ 20260929021500_phase7_security_performance_hardening.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

### phase7_social_realtime_communication

- 20260928225031_phase7_social_realtime_communication.sql ↔ 20260929020000_phase7_social_realtime_communication.sql
- Classificação: **DIVERGENTE**
- Acção: preservar ambos no histórico, não editar, não reaplicar cegamente; novas alterações usam novo timestamp e propósito único.

## Drift actual

O histórico remoto não está actualmente 1:1 por timestamp com o checkout local. Há versões locais com renumeração remota, e vice-versa. Isto não deve ser resolvido por migration repair durante esta execução. A reconciliação mantém-se um gate separado até o procedimento aprovado ser executado.

## Gate

`supabase test db` ainda não está verde nesta execução. As suites já mostram falhas relacionadas com a nova regra de KYC aprovado, além de falhas históricas noutras fases. Portanto o bloqueador 0.6 não pode ser marcado concluído ainda.

## Refresh operacional 2026-10-01

- O histórico remoto real consultado no projecto Supabase `gaonupelgtpfthouyobh` contém 220 versões.
- Existem 10 grupos de nomes lógicos duplicados no histórico remoto. São pares históricos já cobertos pelo allowlist de `scripts/check-migrations.mjs`.
- Nenhuma migração aplicada foi editada ou apagada.
- Desde o snapshot desta auditoria, o Git registra 16 ficheiros de migração adicionados e 2 renomeados.
- O estado local e remoto não deve ser alinhado por migration repair. A regra continua forward-only.
- O CI de produção teve uma correcção de sintaxe na lista de suites da Fase 9 no commit `8c1544dca2232ef32922a35463fe971c7f03ec09`.
- A ferramenta GitHub ligada nesta sessão não expõe os runs de push de `main`; portanto o estado verde final do CI ainda não foi certificado por esta ligação.