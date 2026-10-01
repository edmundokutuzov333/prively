# RELATÓRIO — FASE 9

Funcionalidade concluída: Assinaturas por níveis

Migrações aplicadas:
1. `20261001120935 phase9_subscription_levels_runtime_contract` — migration inicialmente registada sem DDL devido a aplicação operacional incompleta; não contém alteração efectiva.
2. `20261001121001 phase9_subscription_levels_runtime_contract_apply` — migration forward-only com a implementação efectiva da Fase 9.

RLS testada: (tabela → teste → resultado)
- `subscription_tiers` → RLS activo, SELECT público, DML directo de `authenticated` revogado → verificado em produção após migration.
- `subscriptions` → RLS activo, leitura limitada a subscritor/criadora do canal, DML directo de `authenticated` revogado → verificado em produção após migration.
- `tiers_read` → policy `anon,authenticated` com `USING(true)` → verificado em produção.
- `subscriptions_parties` → policy para subscritor/proprietária → verificado em produção.

Edge Functions/RPCs novas: (lista + estado + versão em produção)
- `upsert_subscription_tier(uuid,text,smallint,bigint,jsonb)` → ACTIVE, SECURITY DEFINER, `search_path=public,pg_temp`, EXECUTE apenas `authenticated`.
- `subscribe_to_tier(uuid,smallint,text)` → ACTIVE, SECURITY DEFINER, idempotente, EXECUTE para `authenticated`.
- `cancel_subscription(uuid)` → ACTIVE, SECURITY DEFINER, EXECUTE para `authenticated`.
- `renew_due_subscriptions()` → ACTIVE, SECURITY DEFINER, EXECUTE apenas `service_role`, cron diário `0 3 * * *`.
- `can_view_post` existente não foi recriado: produção já contém as regras `subscribers` e `tier`; a Fase 9 reutilizou esse contrato.
- Helpers `has_active_subscription`/`has_tier_rank` deixaram de ser executáveis por `authenticated`.

Rotas/páginas alteradas: (lista)
- `/c/:handle` → todos os níveis reais do canal, escolha de período 1/3/6/12 meses, confirmação, preço de apresentação calculado a partir do contrato do servidor e estados de erro/sucesso.
- `/apoio` / `ClientSupportCreatorPage` → RPC antiga `subscribe` alinhada para `subscribe_to_tier`.
- `/estudio/definicoes/subscricoes` → gestão real dos níveis da própria criadora, com Bronze/Prata/Ouro/VIP, preço mensal e descontos 3/6/12 meses.
- `/estudio/definicoes` → ligação para a gestão de níveis.
- pt-MZ/en/fr → microcopy e erros de subscrição adicionados.

Testes correram: 
- Verificação SQL transaccional de produção após migration → executada; `reconcile_ledger()=0`, schema/RLS/grants/cron confirmados, `subscription_tiers=0`, `subscriptions=0`.
- `supabase/tests/database/phase9_subscriptions_test.sql` → adicionado ao CI, mas ainda não concluído no runner nesta hora de fecho deste relatório.
- `npm typecheck/lint/test/build` → não executados localmente; o job `Prively CI` foi disparado e estava em execução no commit de fecho.

Critérios de aceitação:
- [✓] Desconto correcto para 1/3/6/12 meses — lógica server-side implementada no RPC e renovação; confirmação automatizada pendente no CI.
- [✓] Renovação falhada entra `past_due` e mantém acesso durante a janela de 3 dias — contracto server-side preserva o estado durante a grace window.
- [✓] Após mais de 3 dias em `past_due`, a subscrição passa a `expired` e `auto_renew=false` — corrigido no job de renovação.
- [✓] Subscrições com `auto_renew=false` expiram quando o período termina — corrigido no job.
- [✓] `can_view_post` cobre `subscribers` e `tier` — confirmado no catálogo de função em produção.
- [✓] `subscribe_to_tier` usa `_kind='subscription'` através do motor financeiro interno — confirmado na definição de produção.
- [✓] Idempotência por utilizador/chave é preservada — mantida no RPC existente e reassegurada no migration forward-only.
- [✓] Cliente não pode fazer DML directo nas tabelas de subscrições — privilégios revogados.
- [✓] Criadora consegue gerir níveis apenas do próprio canal via RPC server-side.
- [✗] Certificação final CI ainda pendente — runner `Prively CI` ainda estava em execução no momento do relatório.
- [✗] Certificação end-to-end de browser/Vercel permanece pendente pelos blockers transversais já conhecidos.

Bugs conhecidos / UNVERIFIED:
- O histórico remoto contém a migration `phase9_subscription_levels_runtime_contract` registada sem DDL efectivo; foi preservada intacta e compensada por `phase9_subscription_levels_runtime_contract_apply`. Nenhuma migration aplicada foi editada ou apagada.
- Não há tiers reais em produção neste momento: `subscription_tiers=0`, portanto a UI de subscrições fica correctamente vazia até uma criadora configurar níveis reais.
- CI final, Vercel, staging Supabase e restore drill continuam UNVERIFIED.
- O processor externo de media e as verificações B2/Streamtape da Fase 8 continuam blockers independentes e não foram mascarados pela Fase 9.
- Reconciliacao de migrações 0.6 continua aberta.

docs/STATE.md actualizado: sim

Pronto para a Fase 10: não — falta concluir CI/QA da Fase 9 e permanecem os gates transversais 0.6, 0.7, Vercel e certificação final da Fase 8.
