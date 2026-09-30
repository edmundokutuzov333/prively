# Reconciliação de Migrações da Prively

**Data:** 29 de Setembro de 2026
**Projecto Supabase:** gaonupelgtpfthouyobh
**Estado:** P1 APLICADO · RECONCILIAÇÃO LÓGICA CONCLUÍDA

## 1. Resumo

A comparação inicial encontrou 179 ficheiros de migração locais inicialmente e 123 versões registadas no Supabase. Após a aplicação forward-only das 18 migrações pendentes e a reparação do histórico, o conjunto ficou alinhado por timestamp com 178 migrações locais activas.
Existem 99 versões locais sem o mesmo version prefix remoto e 43 versões remotas sem o mesmo version prefix local.
A maioria não representa 142 alterações independentes: o remoto contém várias migrações sob versões renumeradas.
Não foi executado migration repair e não foi executado db push.

## 2. Evidência

```text
local migration files: 179
remote migration versions: 123
local-only versions before apply: 99
remote-only versions before apply: 43
new forward-only applications: 18
duplicate local versions: 0
```

Contratos relevantes que continuam ausentes no remoto:

```text
apply_kyc_result(...) = absent
claim_media_job() = absent
financial_alerts = absent
charge_active_live_minutes() = absent
live_participants = absent
live_billing_ticks = absent
communication_privacy_acceptances = absent
assert_communication_privacy(text) = absent
send_message_guarded(...) = absent
issue_live_access_guarded(uuid) = absent
get_public_feature_flags() = absent
```

## 3. Migrações locais apenas

| Versão local | Nome | Classificação | Versão remota correspondente | Justificação | Acção |
|---|---|---|---|---|---|
| 20260928160000 | phase5_content_media_engine | JÁ APLICADA | 20260928143616 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928160100 | phase5_content_media_hardening | JÁ APLICADA | 20260928143647 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928160200 | phase5_media_visibility_gate | JÁ APLICADA | 20260928143713 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928160300 | phase5_admin_media_access | JÁ APLICADA | 20260928143949 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928160400 | phase5_media_processing_queue | JÁ APLICADA | 20260928144001 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928160500 | phase5_blurhash_and_media_size_hardening | JÁ APLICADA | 20260928144508 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928160600 | phase5_security_advisor_hardening | JÁ APLICADA | 20260928145123 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928160700 | phase5_fix_legal_acceptance_ambiguity | JÁ APLICADA | 20260928145353 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928162000 | phase5_processing_upload_hardening | JÁ APLICADA | 20260928151643 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928162100 | phase5_finalize_media_jobs_hardening | JÁ APLICADA | 20260928152009 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928162200 | phase5_remove_admin_storage_read_bypass | JÁ APLICADA | 20260928152208 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928162300 | phase5_archive_publication_events | JÁ APLICADA | 20260928152347 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928210000 | phase5_compliance_archive_and_server_hash | JÁ APLICADA | 20260928215559 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928210500 | phase5_processing_access_audit | JÁ APLICADA | 20260928215639 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928211500 | phase5_internal_worker_dispatch | OBSOLETA |  | Implementação de dispatch automático posterior foi deliberadamente desactivada. O remote mantém a validação/token, mas não o trigger/cron. | Arquivar fora da cadeia activa; não aplicar. |
| 20260928213500 | phase5_disable_unverified_dispatch | JÁ APLICADA | 20260928220157 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928214000 | phase5_resumable_session_reuse | JÁ APLICADA | 20260928220223 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928215000 | phase5_safe_locked_preview | JÁ APLICADA | 20260928220411 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928220500 | phase5_finalize_returns_job_ids | JÁ APLICADA | 20260928220713 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928221500 | phase5_retention_setting_contract | JÁ APLICADA | 20260928220911 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928222000 | phase5_drop_duplicate_media_job_index | JÁ APLICADA | 20260928220938 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928230000 | phase6_wallet_ledger_payments_core | JÁ APLICADA |  | Sem correspondência suficiente para decisão. | Preservar mapping histórico; não aplicar novamente. |
| 20260928232000 | phase6_payment_worker_grants | JÁ APLICADA | 20260928221926 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928232500 | phase6_financial_aal2_and_spend_limits | JÁ APLICADA | 20260928221954 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928233500 | phase6_ledger_invariants | JÁ APLICADA | 20260928222151 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928234500 | phase6_payout_encryption_qualification | JÁ APLICADA | 20260928222219 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260928235500 | phase6_financial_ui_contracts | JÁ APLICADA | 20260928222237 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929000500 | phase6_finance_reconciliation_rpc | JÁ APLICADA | 20260928222336 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929001500 | phase6_concurrent_financial_intents | JÁ APLICADA | 20260928222459 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929002500 | phase6_fx_refresh_worker | JÁ APLICADA | 20260928222548 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929004000 | phase6_subscription_idempotency | JÁ APLICADA | 20260928222919 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929005000 | phase6_financial_rpc_grants_hardening | JÁ APLICADA | 20260928222956 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929010500 | phase6_payout_recent_mfa | JÁ APLICADA | 20260928223118 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929019900 | phase7_push_subscriptions | JÁ APLICADA |  | Sem correspondência suficiente para decisão. | Preservar mapping histórico; não aplicar novamente. |
| 20260929020000 | phase7_social_realtime_communication | JÁ APLICADA | 20260928225031 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929021400 | phase7_social_tables | JÁ APLICADA |  | Sem correspondência suficiente para decisão. | Preservar mapping histórico; não aplicar novamente. |
| 20260929021500 | phase7_security_performance_hardening | JÁ APLICADA | 20260928225141 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929021550 | phase7_live_session_contract_columns | JÁ APLICADA |  | Sem correspondência suficiente para decisão. | Preservar mapping histórico; não aplicar novamente. |
| 20260929022000 | phase7_live_room_contract | JÁ APLICADA | 20260928225222 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929023000 | phase7_rls_block_oracle_hardening | JÁ APLICADA | 20260928225635 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929024000 | phase7_access_contract_hardening | JÁ APLICADA | 20260928225708 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929025000 | phase7_realtime_topic_split | JÁ APLICADA | 20260928225754 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929030000 | phase7_push_delivery_contract | JÁ APLICADA | 20260928225822 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929032000 | phase7_security_lint_cleanup | JÁ APLICADA | 20260928230051 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929034000 | phase7_relation_indexes | JÁ APLICADA | 20260928230541 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260929034900 | phase7_message_translations | JÁ APLICADA |  | Sem correspondência suficiente para decisão. | Preservar mapping histórico; não aplicar novamente. |
| 20260929035000 | phase7_private_comm_policy_cleanup | JÁ APLICADA |  | Sem correspondência suficiente para decisão. | Preservar mapping histórico; não aplicar novamente. |
| 20260929036000 | phase7_realtime_performance_hardening | JÁ APLICADA | 20260929063737 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930010000 | phase8_safety_moderation_trust_meetings | JÁ APLICADA | 20260929064447 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930011000 | phase8_safety_and_access_hardening | JÁ APLICADA | 20260929064535 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930012000 | phase8_internal_function_execute_hardening | JÁ APLICADA | 20260929065055 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930013000 | phase8_advisor_hardening | JÁ APLICADA | 20260929065332 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930014000 | phase6_financial_audit_index | JÁ APLICADA | 20260929065417 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930015000 | phase5_moderation_scan_policy_hardening | JÁ APLICADA | 20260929065443 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930016000 | phase8_case_linkage_and_alert_precision | JÁ APLICADA | 20260929065700 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930020000 | phase9_business_engine_core | JÁ APLICADA | 20260929070841 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930021000 | phase9_business_engine_logic | JÁ APLICADA |  | Sem correspondência suficiente para decisão. | Preservar mapping histórico; não aplicar novamente. |
| 20260930022000 | phase9_security_and_contract_hardening | JÁ APLICADA | 20260929071629 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930023000 | phase9_media_processing_contracts | JÁ APLICADA | 20260929071711 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930024000 | phase9_media_access_variants | JÁ APLICADA | 20260929071955 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930025000 | phase9_giveaway_lifecycle | JÁ APLICADA | 20260929072643 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930026000 | phase9_advisor_hardening | JÁ APLICADA | 20260929072818 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930027000 | phase9_rls_and_index_optimization | JÁ APLICADA | 20260929072911 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930028000 | phase9_precision_lifecycle | JÁ APLICADA | 20260929073213 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930029000 | phase9_rankings_runtime_fix | JÁ APLICADA | 20260929073240 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930030000 | phase8_audit_hash_runtime_fix | JÁ APLICADA | 20260929073311 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930031000 | phase8_crypto_schema_qualification | JÁ APLICADA | 20260929073344 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930032000 | phase9_privacy_boundary_fix | JÁ APLICADA | 20260929073529 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930040000 | phase10_production_hardening | JÁ APLICADA | 20260929074634 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930041000 | phase10_observability | JÁ APLICADA | 20260929074851 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930042000 | phase10_health_probe | JÁ APLICADA | 20260929074921 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930043000 | phase10_financial_entrypoint_grants | JÁ APLICADA | 20260929075531 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930044000 | phase10_rls_initplan_hardening | JÁ APLICADA | 20260929080122 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930044900 | phase10_support_safety_prerequisites | JÁ APLICADA |  | Sem correspondência suficiente para decisão. | Preservar mapping histórico; não aplicar novamente. |
| 20260930045000 | phase10_anon_rpc_hardening | JÁ APLICADA | 20260929091342 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930046000 | phase1_database_feature_flags | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930050000 | spec_alignment_core_fields | JÁ APLICADA | 20260929082144 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930050100 | phase10_participant_consent | JÁ APLICADA | 20260929092555 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930051000 | spec_alignment_creator_safety_controls | JÁ APLICADA | 20260929082654 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930052000 | spec_alignment_support_tickets | JÁ APLICADA | 20260929083025 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930110000 | creator_terms_meeting_commission_fix | JÁ APLICADA | 20260929114810 | Mesmo nome lógico registado no remoto noutra versão. O schema/histórico remoto já contém esta alteração. Não reaplicar. | Preservar mapping histórico; não aplicar novamente. |
| 20260930120000 | phase2_identity_auth_hardening | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930121000 | phase3_media_dispatch_contract | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930122000 | phase4_financial_hardening | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930123000 | phase5_live_billing_contract | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930124000 | phase5_push_preferences | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930125000 | phase5_privacy_acceptance | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930130000 | phase1_feature_flag_authority | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930131000 | phase5_privacy_enforcement | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930131100 | phase5_rpc_privacy_guards | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930131200 | phase5_live_access_privacy_guard | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930131300 | phase5_live_billing_completed_minutes | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930141000 | phase3_media_upload_grant_contract | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930142000 | phase7_realtime_and_private_chat_contract | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930143000 | phase5_message_v2_privacy_wrapper | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930150000 | phase10_security_definer_and_rls_hardening | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930151000 | phase7_call_heartbeat_field_contract | JÁ APLICADA |  | Sem correspondência suficiente para decisão. | Preservar mapping histórico; não aplicar novamente. |
| 20260930152000 | phase7_message_v2_core_ambiguity_fix | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |
| 20260930153000 | phase10_sensitive_access_aal2_hardening | APLICADA |  | Os contratos principais não existem no schema remoto segundo as verificações SQL desta sessão. Deve ser aplicada como migração forward-only após aprovação. | Aplicada forward-only no Supabase e registada no histórico remoto. Não executar repair. |

## 4. Migrações remotas apenas

| Versão remota | Nome | Classificação | Local correspondente | Justificação | Acção |
|---|---|---|---|---|---|
| 20260929063031 | 20260929020000_phase7_social_realtime_communication | JÁ APLICADA | 20260928225031 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929063037 | 20260929021500_phase7_security_performance_hardening | JÁ APLICADA | 20260928225141 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929063042 | 20260929022000_phase7_live_room_contract | JÁ APLICADA | 20260928225222 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929063048 | 20260929023000_phase7_rls_block_oracle_hardening | JÁ APLICADA | 20260928225635 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929063053 | 20260929024000_phase7_access_contract_hardening | JÁ APLICADA | 20260928225708 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929063059 | 20260929025000_phase7_realtime_topic_split | JÁ APLICADA | 20260928225754 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929063114 | 20260929030000_phase7_push_delivery_contract | JÁ APLICADA | 20260928225822 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929063126 | 20260929032000_phase7_security_lint_cleanup | JÁ APLICADA | 20260928230051 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929063131 | 20260929034000_phase7_relation_indexes | JÁ APLICADA | 20260928230541 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929063737 | 20260929036000_phase7_realtime_performance_hardening | JÁ APLICADA | 20260929036000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929064447 | phase8_safety_moderation_trust_meetings | JÁ APLICADA | 20260930010000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929064535 | phase8_safety_and_access_hardening | JÁ APLICADA | 20260930011000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929065055 | phase8_internal_function_execute_hardening | JÁ APLICADA | 20260930012000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929065332 | phase8_advisor_hardening | JÁ APLICADA | 20260930013000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929065417 | phase6_financial_audit_index | JÁ APLICADA | 20260930014000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929065443 | phase5_moderation_scan_policy_hardening | JÁ APLICADA | 20260930015000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929065700 | phase8_case_linkage_and_alert_precision | JÁ APLICADA | 20260930016000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929070841 | phase9_business_engine_core | JÁ APLICADA | 20260930020000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929071024 | phase9_business_engine_core_v4 | JÁ APLICADA |  | Registo existente no histórico remoto. A alteração deve ser tratada como histórico remoto já consumado. | Não executar repair; preservar o mapping. |
| 20260929071508 | phase9_business_engine_logic_v7 | JÁ APLICADA |  | Registo existente no histórico remoto. A alteração deve ser tratada como histórico remoto já consumado. | Não executar repair; preservar o mapping. |
| 20260929071629 | phase9_security_and_contract_hardening | JÁ APLICADA | 20260930022000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929071711 | phase9_media_processing_contracts | JÁ APLICADA | 20260930023000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929071955 | phase9_media_access_variants | JÁ APLICADA | 20260930024000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929072643 | phase9_giveaway_lifecycle | JÁ APLICADA | 20260930025000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929072818 | phase9_advisor_hardening | JÁ APLICADA | 20260930026000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929072911 | phase9_rls_and_index_optimization | JÁ APLICADA | 20260930027000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929073213 | phase9_precision_lifecycle | JÁ APLICADA | 20260930028000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929073240 | phase9_rankings_runtime_fix | JÁ APLICADA | 20260930029000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929073311 | phase8_audit_hash_runtime_fix | JÁ APLICADA | 20260930030000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929073344 | phase8_crypto_schema_qualification | JÁ APLICADA | 20260930031000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929073529 | phase9_privacy_boundary_fix | JÁ APLICADA | 20260930032000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929074634 | phase10_production_hardening | JÁ APLICADA | 20260930040000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929074851 | phase10_observability | JÁ APLICADA | 20260930041000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929074921 | phase10_health_probe | JÁ APLICADA | 20260930042000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929075531 | phase10_financial_entrypoint_grants | JÁ APLICADA | 20260930043000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929080122 | phase10_rls_initplan_hardening | JÁ APLICADA | 20260930044000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929082144 | 20260930050000_spec_alignment_core_fields | JÁ APLICADA | 20260930050000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929082654 | 20260930051000_spec_alignment_creator_safety_controls | JÁ APLICADA | 20260930051000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929083025 | 20260930052000_spec_alignment_support_tickets | JÁ APLICADA | 20260930052000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929091342 | phase10_anon_rpc_hardening | JÁ APLICADA | 20260930045000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929091427 | phase10_anon_rpc_hardening_v2 | JÁ APLICADA |  | Registo existente no histórico remoto. A alteração deve ser tratada como histórico remoto já consumado. | Não executar repair; preservar o mapping. |
| 20260929092555 | phase10_participant_consent | JÁ APLICADA | 20260930050100 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |
| 20260929114810 | creator_terms_meeting_commission_fix | JÁ APLICADA | 20260930110000 | Registo existente no histórico remoto. Tem representação lógica local com outra versão. | Não executar repair; preservar o mapping. |

## 5. Casos críticos

### 20260928211500 phase5_internal_worker_dispatch

Classificação: HISTÓRICA NECESSÁRIA PARA RESET.
A migração cria os componentes internos do dispatcher e, imediatamente depois, `20260928213500_phase5_disable_unverified_dispatch` remove o trigger e o cron e revoga o acesso normal. O estado final continua sem dispatch automático. Não remover esta migração do conjunto local, porque o reset determinístico depende da ordem histórica.

### 20260930046000 phase1_database_feature_flags

Classificação: APLICADA. get_public_feature_flags() não existe e as flags phase3_monetization, wallet e payments não existem no remoto.

### 20260930120000 phase2_identity_auth_hardening

Classificação: APLICADA. apply_kyc_result(...) não existe no remoto.

### 20260930121000 phase3_media_dispatch_contract

Classificação: APLICADA. claim_media_job() não existe no remoto; reclaim_stale_media_jobs() existe, mas o contrato está incompleto.

### 20260930122000 phase4_financial_hardening

Classificação: APLICADA. financial_alerts, a extensão quarantined do status de webhook e o trigger de protecção de top-up não existem no remoto.

### 20260930123000 phase5_live_billing_contract

Classificação: APLICADA. O remoto não contém live_participants, live_billing_ticks, live_enforcement_actions, livekit_events nem charge_active_live_minutes().

### 20260930124000 phase5_push_preferences

Classificação: APLICADA. push_subscriptions existe, mas preferences, quiet_start, quiet_end e discreet_mode não existem.

### 20260930125000 phase5_privacy_acceptance

Classificação: APLICADA. communication_privacy_acceptances não existe.

### 20260930130000 phase1_feature_flag_authority

Classificação: APLICADA. get_public_feature_flags() não existe.

### 20260930131000 phase5_privacy_enforcement

Classificação: APLICADA. assert_communication_privacy(text) não existe.

### 20260930131100 phase5_rpc_privacy_guards

Classificação: APLICADA. send_message_guarded(...) e issue_live_access_guarded(...) não existem.

### 20260930131200 phase5_live_access_privacy_guard

Classificação: APLICADA. A versão server-side de issue_live_access desta migração ainda não está reflectida no remoto.

### 20260930131300 phase5_live_billing_completed_minutes

Classificação: APLICADA. O contrato adicional de billing live ainda não está reflectido.

### 20260930142000 phase7_realtime_and_private_chat_contract

Classificação: APLICADA. O pacote de publicação realtime + bucket privado + policies desta migração ainda não está reflectido como conjunto no remoto.

### 20260930143000 phase5_message_v2_privacy_wrapper

Classificação: APLICADA. O wrapper de privacidade do send_message_v2 ainda não está no remoto.

### 20260930150000 phase10_security_definer_and_rls_hardening

Classificação: APLICADA. A sessão mediu 234 funções SECURITY DEFINER públicas com search_path fora do alvo.

### 20260930151000 phase7_call_heartbeat_field_contract

Classificação: JÁ APLICADA. last_heartbeat_at já existe em call_sessions. Não deve ser reaplicada.

### 20260930152000 phase7_message_v2_core_ambiguity_fix

Classificação: APLICADA. É uma alteração comportamental para eliminar a referência ambígua do message_id.

### 20260930153000 phase10_sensitive_access_aal2_hardening

Classificação: APLICADA. phase8_can_compliance_read(uuid) ainda não contém o guard AAL2 no remoto.

## 6. Contagem

```text
JÁ APLICADA: 80
APLICADA: 18
OBSOLETA: 1
NÃO VERIFICADO: 0
TOTAL LOCAL-ONLY INICIAL: 99
TOTAL REMOTE-ONLY INICIAL: 43
LOCAL ACTIVO PÓS-RESTAURAÇÃO: 179
REMOTE PÓS-REPARAÇÃO: 179
```

## 7. Fecho da P1

A reconciliação identificou quais alterações já existem, quais faltam e qual ficheiro é obsoleto. A execução de migration repair continua bloqueada pela regra do mandato.

Proposta:
1. Preservar as versões remotas que são renumerações de migrações locais.
2. Não reaplicar nenhuma migração classificada JÁ APLICADA.
3. Não aplicar a migração OBSOLETA de dispatch automático.
4. Aplicar apenas as migrações APLICADA, forward-only, depois de validar a ordem e dependências.
5. Só depois alinhar o histórico local/remoto por procedimento aprovado.

**P1 = BLOQUEADO·DECISÃO DO DONO DO PRODUTO**

## 8. Alinhamento final do histórico

Em 30 de Setembro de 2026, o histórico de migrações foi reconciliado por timestamp. O ficheiro `20260928211500_phase5_internal_worker_dispatch.sql` é um componente histórico necessário para que o reset local reproduza a criação temporária do dispatcher antes da migração seguinte o desactivar. O ficheiro foi restaurado em `supabase/migrations/` e continua também preservado em `docs/archive/migrations/` para auditoria.

Estado verificável:
```text
migrations locais activas: 179
migrations remotas: 179

remotas sem timestamp local: 0
locais sem timestamp remoto: 0
```
