# Prively STATE

Updated: 2026-10-01

## Fase 1
Status: IMPLEMENTED / FINAL CI GATE PENDING

The protected-role/profile foundation is present on main and applied to the production Supabase project.

Acceptance proof is tracked in:
- docs/reports/fase-1-identity-roles.md
- supabase/tests/database/phase1_identity_roles_kyc_test.sql

## Fase 2
Status: IMPLEMENTED / FINAL CI VERIFICATION PENDING

The manual KYC flow, reviewer guard, protected weekly-volume metric and protected status detail are implemented on main and the required Supabase migrations are applied to production.

Acceptance proof is tracked in:
- docs/reports/fase-2-kyc.md
- supabase/tests/database/phase2_kyc_test.sql

Open gates:
- O código da Fase 2 está implementado e o CI final está em verificação no commit actual.
- O teste HTTP local do bucket privado está coberto no CI; prova directa em produção permanece pendente porque o bucket não tem objectos reais.
- Production Vercel project remains NOT VERIFIED.
- Supabase staging project is still missing for restore drill.


## Fase 3
Status: IMPLEMENTED / FINAL CI VERIFICATION PENDING

A criação e gestão de canal foi corrigida no backend e frontend:
- `channels.is_seed` aplicado.
- criação de canal exclusivamente via `create_creator_channel(text,text,text)`.
- INSERT directo por `authenticated` removido.
- policy legada `channels_read` removida.
- validação de handle com RPC e debounce de 400 ms.
- mensagens específicas de erro e estados adicionados em pt-MZ/en/fr.
- canal sintético `criadora_test` marcado como `is_seed=true` em produção.

Acceptance proof:
- docs/reports/fase-3-canal.md
- supabase/tests/database/phase3_channel_creation_test.sql
- supabase/tests/database/phase3_channel_seed_visibility_test.sql

Open gates:
- suites CLI/CI da Fase 3 ainda não foram executadas nesta sessão.
- typecheck/lint/unit/build não foram executados nesta sessão.
- publicação Vercel correcta continua sem verificação no ambiente ligado.

## Fase 4
Status: IMPLEMENTED / FINAL CI VERIFICATION PENDING

Carteira e livro-razão:
- schema financeiro existente reutilizado, sem recriação;
- get_my_balances() implementado e protegido;
- balances publicado no supabase_realtime;
- escrita directa em ledger_entries e balances sem privilégios para authenticated;
- admin_manage_all removida de balances;
- /carteira ligado a dados reais e Realtime;
- estados de carregamento, erro e recuperação implementados;
- i18n pt-MZ/en/fr actualizado;
- suite phase4_ledger_test.sql reforçada e adicionada ao CI;
- reconcile_ledger() em produção = 0.

Acceptance proof:
- docs/reports/fase-4-ledger.md
- supabase/tests/database/phase4_ledger_test.sql

Open gates:
- suite local/CI completa ainda não executada nesta sessão por falha de resolução DNS de github.com no runner disponível;
- build Vercel de produção não certificada neste ciclo.

## Fase 5
Status: IMPLEMENTED / FINAL CI VERIFICATION PENDING

Recarga de carteira:
- topups e payment_webhook_events hardened contra escrita directa por authenticated;
- create_topup_intent() com idempotência, KYC, flag de produção e limites server-side;
- credit_topup() protegido contra amount mismatch e pagamento de topups terminais;
- expire_pending_topups() mantido a cada 10 minutos;
- topups adicionado ao supabase_realtime;
- /carteira ligado a Realtime de balances e topups;
- retry real para failed/expired/cancelled;
- provider adapter manual e fail-closed enquanto PaySuite estiver UNVERIFIED;
- payments-create-topup ACTIVE v35;
- payments-webhook ACTIVE v34;
- suite phase5_topup_test.sql e teste do provider adicionados ao CI.

Production verification:
- wallet.production_enabled=false;
- topups=0 linhas;
- direct DML privileges para authenticated removidos;
- topups em supabase_realtime;
- reconcile_ledger()=0.

Acceptance proof:
- docs/reports/fase-5-topup.md
- supabase/tests/database/phase5_topup_test.sql
- supabase/functions/_shared/payment-provider.test.ts

Open gates:
- testes CLI/CI/typecheck/lint/build ainda não executados nesta sessão;
- PaySuite/sandbox permanece UNVERIFIED;
- Vercel production build continua não certificada;
- migration reconciliation 0.6 continua aberta.

## Fase 6
Status: IMPLEMENTED / FINAL CI VERIFICATION IN PROGRESS

Motor de gasto:
- spend_on_channel() público para authenticated, com _spend_on_channel() interno;
- idempotência por owner_id + _idem;
- commission_rate() alimentado por platform_settings;
- assert_spend_limit() aplicado antes do débito;
- wallet protegido por SELECT FOR UPDATE;
- lançamentos wallet + creator_pending + platform_revenue balanceados;
- hold_hours configurável, actualmente 72h;
- release_due_earnings() activo a cada 15 minutos;
- índice único parcial em ledger_entries.release_source_id;
- escrow release filtering corrigido para source_type + source_id;
- erros financeiros ligados a i18n;
- fluxo PPV com insufficient_funds e atalho para /carteira;
- suite phase6_spend_engine_test.sql adicionada ao CI.

Production verification:
- migration 20261001123000_phase6_spend_engine_runtime_hardening aplicada;
- release_source unique index presente;
- cron prively-release-earnings activo;
- authenticated só executa spend_on_channel, não o motor interno;
- commission_rate não é executável por authenticated;
- reconcile_ledger() = 0;
- ledger_rows = 0;
- wallet_negative_rows = 0.

Acceptance proof:
- docs/reports/fase-6-spend-engine.md
- supabase/tests/database/phase6_spend_engine_test.sql
- scripts/concurrency-spend.mjs

Open gates:
- Prively CI no commit e005bc2aab6b620beefeec1321bc23e5da42c729 ainda em execução;
- bloqueador transversal 0.6 de reconciliação de migrações continua aberto;
- Vercel production build não certificada.


## Fase 7
Status: IMPLEMENTED / FINAL CI CERTIFICATION PENDING

Publicação de conteúdo com visibilidade granular:
- content_consents criado com RLS, unicidade por post e trigger imutável;
- attest_post_content_consent() criado para persistir a declaração de maiores de 18 anos e consentimento;
- publish_post() exige consentimento antes de qualquer publicação;
- publish_scheduled_posts() ignora posts agendados sem consentimento;
- DML directo por authenticated em posts removido; a escrita passa pelo RPC de conteúdo;
- /estudio/conteudo passou a persistir consentimento e suporta publicação imediata ou agendada;
- visibilidade private exposta no formulário e bloqueada no servidor para qualquer utilizador que não seja a proprietária;
- i18n pt-MZ/en/fr actualizado;
- suite phase7_content_publication_test.sql criada com 30 assertions;
- suite adicionada ao CI.

Production verification:
- migration 20261001150000_phase7_content_publication_contract aplicada;
- content_consents em produção = 0 linhas após prova transaccional rollback;
- posts INSERT/UPDATE/DELETE por authenticated = false;
- prively-publish-posts activo a cada minuto;
- publish_post() e publish_scheduled_posts() contêm a guarda de consentimento;
- reconcile_ledger() = 0;
- prova transaccional real passou: consentimento obrigatório, PPV sem preço bloqueado e scheduled invisível antes de publish_at.

Acceptance proof:
- docs/reports/fase-7-content-publication.md
- supabase/tests/database/phase7_content_publication_test.sql

Open gates:
- CI completo / supabase test db ainda não certificado como verde nesta execução;
- bloqueador transversal 0.6 de reconciliação de migrações continua aberto;
- Vercel production project continua não certificado;
- smoke E2E de produção continua com o problema de selector de autenticação já existente em /entrar.
- Fase 8 não inicia antes de estes gates serem resolvidos.



## Fase 8
Status: IMPLEMENTED / HARDENED / FINAL CERTIFICATION PENDING

Entrega segura de media:
- trio certificado `get-media-url` / `create-media-upload` / `get-video-playback-url` não foi alterado;
- produção confirmou ACTIVE v39 / v13 / v11, com JWT obrigatório;
- `get_media_access()` usa `can_view_post()` e agora exige derivados seguros para acesso não-owner/admin;
- `refresh_media_processing_status()` corrigido para remover o fast-path de vídeo que permitia `ready` sem thumbnail, watermark, HLS e Streamtape pronto;
- RLS de `media_assets` e `media_access_logs` activa;
- `refresh_media_processing_status()` executável apenas por service_role;
- suite existente `phase8_media_delivery_verification_test.sql` mantida;
- suite nova `phase8_media_security_test.sql` com 21 assertions adicionada ao CI;
- ADR-012 registado em `docs/decisions.md`.

Production verification:
- migration `20261001170000_phase8_media_derivative_readiness_fix` aplicada;
- o único asset de vídeo activo tinha `streamtape_status='ready'`, mas não tinha thumbnail/watermark/HLS; a correcção mudou o estado de `ready` para `failed` por falta de derivados/processor;
- media activos: 1; vídeos activos: 1; vídeos activos `ready`: 0;
- thumbnails derivadas activas: 0; watermarks derivadas activas: 0;
- `reconcile_ledger()=0`;
- nenhuma alteração foi feita às três Edge Functions certificadas.

Acceptance / open gates:
- Secret `MEDIA_BACKEND=b2`: UNVERIFIED directamente; runtime efectivo observado é B2.
- CORS B2 no painel/API: UNVERIFIED.
- staging Supabase: inexistente; transição de vídeo novo end-to-end UNVERIFIED.
- processor externo de media: não configurado no asset activo; thumbnail/watermark jobs bloqueados com `processor_not_configured`.
- CI completo ainda não certificado.
- Vercel e blockers 0.6/0.7 continuam abertos.
- Fase 9 não inicia.


## Fase 9
Status: IMPLEMENTED / FINAL CI CERTIFICATION PENDING

Assinaturas por níveis:
- migration forward-only efectiva `20261001180100_phase9_subscription_levels_runtime_contract_apply.sql` aplicada em produção;
- `subscription_tiers` e `subscriptions` permanecem com RLS;
- leitura de tiers disponível publicamente; DML directo de clientes revogado;
- `upsert_subscription_tier()`, `subscribe_to_tier()` e `cancel_subscription()` expostos apenas ao utilizador autenticado;
- `renew_due_subscriptions()` apenas para `service_role`, com cron diário às 03:00;
- `has_active_subscription()` mantém acesso a subscrições `past_due` durante a janela de 3 dias, sem execução directa por `authenticated`;
- renovação corrigida para expirar `past_due` além de 3 dias e expirar subscrições sem auto-renovação cujo período terminou;
- `can_view_post()` existente já cobre `subscribers` e `tier` e foi reutilizado;
- UI do cliente cobre todos os níveis existentes e 1/3/6/12 meses;
- UI da criadora permite gerir Bronze/Prata/Ouro/VIP por canal;
- i18n pt-MZ/en/fr e alinhamento do fluxo legado `/apoio` concluídos;
- suite `phase9_subscriptions_test.sql` adicionada ao CI.

Production verification:
- migration efectiva aplicada com sucesso;
- `subscription_tiers=0`;
- `subscriptions=0`;
- grants dos RPCs confirmados;
- `has_active_subscription()` corrigida para a grace window de 3 dias;
- RLS/policies confirmadas;
- cron `prively-renew-subscriptions` activo com `0 3 * * *`;
- `reconcile_ledger()=0`.

Open gates:
- CI final desta alteração ainda em execução;
- teste pgTAP Phase 9 ainda não certificado como verde;
- Vercel production continua não certificada;
- 0.6 migration reconciliation continua aberta;
- 0.7 staging/restore drill continua aberto;
- certificação final da Fase 8 continua pendente.

Pronto para Fase 10: não.
