# RELATÓRIO — FASE 5

## Funcionalidade concluída
Recarga de carteira (top-up) com intenção idempotente, limites financeiros no servidor, confirmação por webhook, crédito no ledger e actualização por Realtime.

A implementação reutiliza as tabelas financeiras existentes. Não foram recriadas nem duplicadas estruturas de topups, ledger_entries, balances ou payment_webhook_events.

## Diagnóstico antes da correcção
- topups estava sujeito a uma policy administrativa genérica de escrita;
- payment_webhook_events também tinha caminho administrativo de mutação;
- authenticated mantinha privilégios de tabela incompatíveis com o princípio de que o cliente não altera estado financeiro directamente;
- topups não estava publicado no supabase_realtime;
- create_topup_intent() não devolvia ao frontend os limites efectivos da carteira;
- a transição de failed/cancelled/expired para paid precisava de ser bloqueada;
- payments-create-topup fazia chamadas directas a uma API PaySuite ainda não validada documentalmente.

## Migração aplicada
- supabase/migrations/20261001112500_phase5_topup_runtime_contract.sql

A migração foi aplicada em produção de forma forward-only.

O histórico remoto do Supabase registou a migração pelo nome lógico phase5_topup_runtime_contract na versão 20261001100142. O ficheiro versionado no repositório mantém o timestamp 20261001112500. Este mapping deve ser reconciliado no próximo ciclo de auditoria de migrações antes de qualquer db pull automatizado.

## RLS e grants
Em produção foi confirmado:
- INSERT/UPDATE/DELETE em topups sem privilégio para authenticated;
- INSERT/UPDATE/DELETE em payment_webhook_events sem privilégio para authenticated;
- INSERT em idempotency_keys sem privilégio para authenticated;
- admin_manage_all removida de topups, payment_webhook_events e idempotency_keys;
- leitura de topups permanece limitada pelo proprietário/finance/admin;
- leitura financeira de payment_webhook_events inclui finance/admin;
- credit_topup() permanece apenas para service_role;
- create_topup_intent() permanece disponível para authenticated.

## Contratos SQL
get_financial_settings() passou a devolver wallet_topup_enabled, wallet_min_topup_centavos, wallet_max_topup_centavos e wallet_daily_topup_limit_centavos.

Valores actualmente confirmados em produção:
- carteira financeira: desactivada;
- mínimo: 10.000 centavos, 100 MT;
- máximo: 500.000 centavos, 5.000 MT;
- limite diário: 1.000.000 centavos, 10.000 MT;
- limite máximo da carteira: 5.000.000 centavos, 50.000 MT;
- cartão: desactivado.

create_topup_intent() agora serializa intents por utilizador, reutiliza a mesma intenção quando recebe a mesma chave de idempotência, valida KYC/idade, flag de produção, mínimo/máximo, limite diário e limite máximo da carteira, e regista a intenção no financial audit log.

credit_topup() agora ignora confirmações repetidas quando o topup já está paid, rejeita pagamento de topups failed/cancelled/expired/reversed/reversal_pending, valida o limite máximo da carteira antes do crédito, mantém a transacção de partidas dobradas e continua a gerar receipt/invoice/audit.

expire_pending_topups() mantém o job de 10 em 10 minutos para fechar intents expirados.

## Edge Functions
payments-create-topup está ACTIVE, versão 35, JWT obrigatório. A chamada directa a um endpoint PaySuite não validado foi removida. O código usa o contrato PaymentProvider e o adapter manual, que devolve provider_unverified até existir documentação oficial, sandbox e contrato confirmado.

payments-webhook está ACTIVE, versão 34, JWT desactivado. Mantém HMAC em tempo constante, idempotência por evento, hash determinístico sem event ID, processamento por RPC e quarentena de erros permanentes com HTTP 200.

Foi acrescentado topup_not_payable e topup_balance_limit_exceeded ao conjunto de erros permanentes.

## Realtime
public.topups foi adicionado ao supabase_realtime.

/carteira subscreve balances filtrado por owner_id e topups filtrado por user_id. Alterações financeiras reais provocam recarga sem polling artificial.

## Frontend
Foram actualizados Phase6FinancialPages.tsx e os locales pt-MZ, en e fr.

A carteira agora tem loading explícito, erro com recuperação, estado de recarga indisponível, limites reais vindos do servidor, histórico real, estados traduzidos de top-up, retry real para failed/expired/cancelled e actualização Realtime.

Enquanto wallet.production_enabled=false, a UI não permite iniciar uma recarga externa.

## Testes
Foram adicionados:
- supabase/tests/database/phase5_topup_test.sql;
- integração da suite no CI;
- supabase/functions/_shared/payment-provider.test.ts.

A suite SQL cobre RLS, ausência de escrita directa, grants, Realtime, idempotência, mínimo/máximo, dez confirmações repetidas para o mesmo top-up, crédito único, transacção equilibrada, expiração, bloqueio de topup_not_payable, reconciliação e wallet não negativo.

## Verificação real em produção
Executado no Supabase real:
- migração aplicada com sucesso;
- get_financial_settings() devolve os novos contratos e limites;
- topups está em supabase_realtime;
- topups tem 0 linhas após a implementação;
- INSERT/UPDATE/DELETE directos por authenticated estão sem privilégio;
- payment_webhook_events não aceita mutação directa por authenticated;
- idempotency_keys não aceita INSERT directo por authenticated;
- wallet.production_enabled=false;
- reconcile_ledger() continua em 0;
- payments-create-topup está ACTIVE v35;
- payments-webhook está ACTIVE v34.

Nenhum saldo, top-up ou lançamento fictício foi criado em produção.

## Testes não executados
Não foram executados nesta sessão: supabase db reset, supabase test db, supabase db lint --local, deno test, npm run typecheck, npm run lint e npm run build.

O ambiente local não tem deno nem o CLI do Supabase, e o acesso Git directo ao GitHub continua bloqueado por resolução DNS no runner disponível.

O workflow CI foi actualizado, mas ainda não há um resultado CI novo associado aos commits desta execução.

O teste HTTP black-box do webhook contra um fornecedor real não foi executado porque o contrato/sandbox PaySuite continua UNVERIFIED e a carteira permanece deliberadamente desactivada.

## Critérios de aceitação
| Critério | Estado |
|---|---|
| Mesmo _idem ×2 = um crédito | ✓ implementação + suite |
| Webhook duplicado ×10 = um crédito | ✓ implementação + suite |
| amount_mismatch entra em quarentena HTTP 200 | ✓ implementação; black-box UNVERIFIED |
| Saldo actualiza por Realtime | ✓ contrato + Realtime confirmado |
| Cliente não altera topups/webhook/ledger directamente | ✓ produção confirmada |
| Limites são decididos no servidor | ✓ produção confirmada |
| Topup expirado não pode ser pago depois | ✓ implementação + suite |
| Provider não validado não é tratado como operacional | ✓ provider adapter + flag de produção |

## Bugs conhecidos / UNVERIFIED
1. PaySuite permanece UNVERIFIED: falta contrato oficial, sandbox validado e configuração de produção.
2. A suite completa ainda precisa de execução em CI/runner.
3. A build Vercel de produção continua não certificada.
4. A reconciliação formal das migrações 0.6 continua aberta e deve reconciliar o mapping lógico phase5_topup_runtime_contract antes do próximo ciclo de migrações.

## docs/STATE.md actualizado
Sim.

## Pronto para a Fase 6
Não para certificação formal.
A funcionalidade Fase 5 está implementada e o backend de produção está endurecido. A certificação formal permanece bloqueada até CI/local passarem e o provider externo ser validado.