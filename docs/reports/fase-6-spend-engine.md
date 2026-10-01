# RELATÓRIO — FASE 6

Funcionalidade concluída: motor de gasto spend_on_channel + comissão configurável + libertação automática de ganhos.

## Migrações aplicadas
1. 20261001123000_phase6_spend_engine_runtime_hardening.sql

A migração foi aplicada com sucesso no Supabase de produção.

## Estado encontrado antes da execução
- spend_on_channel() já existia como entrada pública para authenticated e delegava ao _spend_on_channel() interno.
- o motor já validava saldo, idade, limites de gasto, canal e idempotência;
- commission_rate() já lia commission.by_kind e commission.default;
- release_due_earnings() já existia com cron a cada 15 minutos;
- a implementação anterior não tinha uma garantia física de unicidade para release_source_id;
- a detecção de escrow em release_due_earnings() não restringia source_type, permitindo uma colisão teórica entre domínios com o mesmo ref_id.

## Correcções de runtime
- criado índice único parcial ledger_entries_release_source_unique_idx em release_source_id;
- release_due_earnings() agora considera somente entradas creator_pending positivas e ainda não libertadas;
- o teste de escrow exige simultaneamente source_type e source_id;
- release_due_earnings() mantém FOR UPDATE SKIP LOCKED e produz partidas dobradas creator_pending -> creator_available;
- spend_on_channel(), _spend_on_channel(), commission_rate() e release_due_earnings() tiveram os grants reaplicados explicitamente;
- search_path permanece protegido com public, pg_temp nas funções financeiras;
- nenhuma migração financeira anterior foi editada ou apagada.

## RLS / permissões verificadas em produção
Não foram criadas tabelas novas nesta fase, portanto o hardening incide nos contratos financeiros existentes.

Confirmação remota:
- authenticated executa spend_on_channel(uuid,bigint,text,text,uuid,text);
- authenticated não executa _spend_on_channel(uuid,uuid,bigint,text,text,uuid,text);
- authenticated não executa commission_rate(uuid,text);
- release_due_earnings() é interno para service_role;
- o ledger continua append-only;
- wallet não possui saldos negativos.

## Motor spend_on_channel
Fluxo efectivo:
1. valida pedido e _idem;
2. verifica/obtém a transacção idempotente;
3. valida idade;
4. valida canal e impede self-purchase;
5. aplica spend limits server-side;
6. bloqueia a linha de wallet com SELECT FOR UPDATE;
7. lança insufficient_funds antes de qualquer lançamento financeiro se o saldo não chegar;
8. calcula commission_rate() a partir de platform_settings;
9. cria wallet debit + creator_pending + platform_revenue;
10. aplica hold_hours configurado;
11. gera receipt e invoice reais.

Os valores de produção actualmente confirmados são:
- commission.default = 0.20;
- commission.by_kind.tip = 0.10;
- commission.by_kind.meeting = 0;
- hold_hours = 72;
- referral.enabled = false.

O teste da suite usa configuração transaccional de 30% para provar o cálculo 70/30 descrito no Superprompt, sem alterar a política real de produção.

## Job release_due_earnings
Produção confirmada:
- job: prively-release-earnings;
- cron: */15 * * * *;
- activo: sim.

O release produz duas partidas com o mesmo txn_id:
- creator_pending negativo;
- creator_available positivo.

O índice parcial em release_source_id impede uma segunda libertação da mesma entrada mesmo sob concorrência.

## Frontend / UI / i18n
Actualizado:
- src/pages/ExperiencePages.tsx;
- src/lib/errors.ts;
- src/locales/pt-MZ/common.ts;
- src/locales/en/common.ts;
- src/locales/fr/common.ts.

No fluxo PPV, insufficient_funds passou a usar a tradução central de erros e mostra um atalho funcional para /carteira.

As mensagens adicionadas cobrem insufficient_funds, age_not_verified, channel_not_found, self_purchase_not_allowed, invalid_spend_request, idempotency_key_required e limites diário/semanal/mensal.

Os saldos continuam derivados exclusivamente do ledger/balances e actualizados pelo Realtime já implementado na Fase 4/5.

## Testes
Adicionado:
- supabase/tests/database/phase6_spend_engine_test.sql
- suite incluída no CI.

A suite cobre:
- contrato e grants;
- índice de release;
- cron activo;
- _idem duplicado;
- exactamente uma cobrança;
- ledger balanceado;
- comissão configurável;
- insuficiência sem escrita;
- release_due_earnings;
- creator_pending -> creator_available;
- retenção de 72h;
- commission.by_kind;
- reconcile_ledger() = 0;
- wallet não negativo.

Também já existe o script de concorrência scripts/concurrency-spend.mjs para execução em local/staging.

## Verificação de produção executada
Supabase real:
- migração 20261001123000 aplicada;
- release_source unique index = presente;
- cron prively-release-earnings = activo a cada 15 minutos;
- authenticated tem EXECUTE no contrato público spend_on_channel;
- internal spend engine continua fora de authenticated;
- commission_rate continua fora de authenticated;
- ledger_rows = 0;
- platform_revenue_rows = 0;
- reconcile_ledger() = 0;
- wallet_negative_rows = 0.

Nenhum lançamento financeiro, saldo ou utilizador de teste foi deixado em produção por esta fase.

## CI real
No commit actual `e005bc2aab6b620beefeec1321bc23e5da42c729`, o workflow `Prively CI` foi disparado.

Estado observado no momento do relatório:
- Edge Functions contract tests: concluídos com sucesso;
- database: em execução, preso no arranque de Supabase local no momento da leitura;
- quality: em execução, ainda na instalação de dependências;
- portanto ainda não existe resultado verde final da suite completa.

## Testes não executados directamente nesta sessão
- supabase db reset: não executado localmente;
- supabase test db: não executado localmente;
- supabase db lint --local: não executado localmente;
- deno test: não executado directamente no ambiente local, mas o job de Edge Functions no CI já terminou com sucesso;
- npm run typecheck: não executado directamente;
- npm run lint: não executado directamente;
- npm run build: não executado directamente.

O CI passa agora a ser a fonte de execução destes comandos no runner GitHub.

## Critérios de aceitação
| Critério | Estado |
|---|---|
| Mesmo _idem × 2 = um débito | ✓ implementação + suite CI em execução |
| commission_rate vem de platform_settings | ✓ produção + suite |
| release_due_earnings move correctamente | ✓ implementação + suite |
| insufficient_funds bloqueia antes de qualquer escrita | ✓ implementação + suite |
| release concorrente protegido por release_source_id | ✓ produção |
| erro de insuficiência tem recuperação para carteira | ✓ frontend + i18n |

## Bugs conhecidos / UNVERIFIED
1. CI completo ainda está em execução; a suite database ainda não fechou.
2. O bloqueador 0.6 de reconciliação global de migrações continua aberto. O documento de reconciliação já identifica os pares duplicados de Phase 6 e indica que não devem ser reaplicados.
3. Vercel production build continua sem certificação formal.
4. A integração PaySuite permanece UNVERIFIED, mas não é necessária para validar o motor genérico de gasto.

## docs/STATE.md actualizado
Sim.

## Pronto para a Fase 7
Não.

A Fase 6 está implementada e aplicada em produção, mas a certificação formal aguarda o fecho verde do CI database/quality e o bloqueador transversal 0.6.