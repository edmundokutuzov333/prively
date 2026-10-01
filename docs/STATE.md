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
Status: IMPLEMENTED / PARTIAL VERIFICATION — CERTIFICATION PENDING

Entrega segura de media:
- não foi recriado nem alterado o trio certificado get-media-url / create-media-upload / get-video-playback-url;
- produção confirmou ACTIVE v39 / v13 / v11, todos com verify_jwt=true;
- get_media_access() exige autorização via can_view_post(), integridade, moderação, scan e processing ready;
- can_view_post() testado em transacção real para owner, public, followers e PPV;
- vídeos B2 são bloqueados no get-media-url() com video_delivery_required e só passam por get-video-playback-url() quando Streamtape está ready;
- media_access_logs tem RLS activo e leitura restrita ao próprio utilizador/admin.audit;
- suite phase8_media_delivery_verification_test.sql criada com 23 assertions e adicionada ao CI;
- nenhuma migração de produção foi necessária nesta fase.

Production verification:
- assets efectivos observados usam storage_provider=backblaze_b2;
- asset metadata efectiva observada: media_backend=b2 e bucket prively-media-originals-2026;
- prively-publish-posts e streamtape-status-poll permanecem activos; streamtape-status-poll corre a cada 2 minutos;
- reconcile_ledger() = 0.

Open gates:
- MEDIA_BACKEND no Secret não foi confirmado directamente porque a sessão disponível não expõe supabase secrets list;
- CORS aplicado no bucket B2 não foi confirmado directamente;
- não existe staging disponível para executar uma nova transição end-to-end not_started -> processing -> completed;
- o único media asset não apagado actualmente é seed/draft e não tem thumb_blur_path/hls_path/watermark_path preenchidos;
- CI completo ainda não certificado nesta execução;
- blockers 0.6/0.7 e verificação Vercel continuam abertos.
- Fase 9 não inicia antes destes gates.
