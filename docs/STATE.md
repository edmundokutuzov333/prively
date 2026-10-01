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
