# Fecho de gates Prively - 2026-10-01

Esta revisão fecha o trabalho que é possível comprovar com os acessos actualmente ligados. A Fase 10 permanece bloqueada até os gates terem evidência operacional completa.

## 0.6 - Reconciliação de migrações

Snapshot remoto real do projecto Supabase gaonupelgtpfthouyobh:
- 220 versões de migração registadas.
- 10 grupos de nomes lógicos duplicados no histórico remoto.
- Os duplicados são históricos e estão cobertos pelo allowlist de scripts/check-migrations.mjs.
- Nenhuma migração aplicada foi editada ou apagada.

Snapshot do repositório:
- A auditoria anterior tinha 208 ficheiros de migração.
- Desde essa auditoria foram adicionadas 16 migrações e 2 ficheiros foram renomeados, mantendo o número total.
- O checkout actual fica, por derivação do histórico Git desde o snapshot de 208 ficheiros, com 224 ficheiros de migração.
- O checkout actual contém migrações forward-only posteriores ao snapshot remoto, além de ficheiros renomeados historicamente. A diferença não deve ser resolvida com migration repair nem com edição de migrações aplicadas.
- O histórico remoto mantém timestamps antigos para renumerações históricas. Esses pares estão documentados e não devem ser corrigidos com migration repair.

Correcção aplicada ao CI em 8c1544dca2232ef32922a35463fe971c7f03ec09: removido um literal \\n da lista Bash de suites, que podia corromper a execução da suite Phase 9.

Gate 0.6: reconciliado conceptualmente e protegido no repositório, mas a certificação final ainda depende de observar um run verde de supabase test db no CI actual.

## 0.7 - Backup e restore

Implementado na main:
- scripts/backup-db.mjs
- .github/workflows/backup.yml
- backup_runs já existe em produção.
- O script agora usa explicitamente B2_BACKUP_BUCKET para upload, listagem e retenção.
- Agendamento: 03:00 Africa/Maputo, 01:00 UTC.
- Retenção: 30 dias.

O restore drill continua formalmente bloqueado porque a conta Supabase ligada só possui o projecto de produção. Não existe projecto de staging separado para restaurar o dump com segurança.

Gate 0.7: implementação concluída; certificação operacional do restore pendente por infraestrutura externa.

## Vercel

A equipa Vercel ligada ao conector é KUTUZOV, team_7od7FPsJHlZTwqQ0U2qscNH4.
Projectos actualmente visíveis: portfoliokutuzov, barber-os e txunabet2026.
Não existe projecto Vercel prively. Não foi criado um deployment alternativo nem foi mascarada a ausência do projecto oficial.

Gate Vercel: aberto por ausência do projecto oficial e da ligação de produção correspondente.

## Fase 8

Produção confirma:
- get-media-url ACTIVE v39, JWT obrigatório.
- create-media-upload ACTIVE v13, JWT obrigatório.
- get-video-playback-url ACTIVE v11, JWT obrigatório.
- can_view_post() cobre owner, public, followers, subscribers, tier e PPV.
- O contrato de readiness para vídeo é fail-closed.
- reconcile_ledger()=0.

Não é possível certificar nesta ligação:
- Secret MEDIA_BACKEND=b2 directamente através de supabase secrets list.
- CORS aplicado no bucket B2.
- Transição de um vídeo novo em staging, porque não existe staging e o processor externo do asset activo não está configurado.

A Fase 8 não deve ser marcada 100% certificada enquanto estes pontos permanecerem sem evidência operacional.

## Fase 9

Produção confirma por SQL read-only:
- RLS activo em subscription_tiers e subscriptions.
- DML directo de authenticated revogado nas tabelas.
- upsert_subscription_tier(), subscribe_to_tier() e cancel_subscription() executáveis por authenticated.
- renew_due_subscriptions() não é executável por authenticated e é executável por service_role.
- has_active_subscription() não é executável directamente por authenticated.
- Cron prively-renew-subscriptions activo em 0 3 * * *.
- subscription_tiers=0 e subscriptions=0, portanto não há dados comerciais fictícios.
- reconcile_ledger()=0.
- subscribe_to_tier calcula 1/3/6/12 meses no servidor e chama o motor financeiro interno com kind subscription.
- renew_due_subscriptions aplica a janela past_due de 3 dias.
- can_view_post() cobre subscribers e tier.

Gate CI da Fase 9: o defeito de sintaxe foi corrigido na main, mas a ferramenta GitHub ligada nesta sessão não expõe o histórico de runs de push de main. Não é legítimo declarar o run verde sem essa evidência.

## Regra de avanço

A Fase 10 continua bloqueada. Os gates ainda sem evidência operacional final são:
1. run verde actual do CI, incluindo supabase test db;
2. restore drill em staging Supabase;
3. projecto Vercel oficial ligado ao repositório e deployment verificável;
4. evidência externa B2 e vídeo novo end-to-end para a certificação final da Fase 8.

Nenhum destes pontos foi mascarado como verde.

## Fase 10 - implementação concluída, certificação transversal pendente

A implementação técnica da Fase 10 foi fechada na main no commit `0ca81f07c637874d8cd9d9ac04c9543166e5589d`.

Entregas efectivas:
- `purchase_ppv(uuid,text)` em produção já está endurecido com lock transaccional por comprador/publicação, deduplicação por `ppv_purchases`, validação server-side e spend no ledger.
- `ppv_purchases` permanece protegido por RLS e sem INSERT/UPDATE/DELETE directo para `authenticated`.
- Foi adicionada a suite `supabase/tests/database/phase10_ppv_test.sql` cobrindo estrutura de segurança, concorrência lógica, débito único, recibo, `can_view_post` e bloqueio de post público.
- O CI da main inclui a suite PPV tanto na lista canónica `supabase test db` como na suite native SQL.
- `/compras` foi reconstruído como histórico único de PPV + subscrições, ordenado por data, com ligação para conteúdo PPV e descarregamento de recibo PDF através da Edge Function financeira.
- i18n da superfície PPV foi fechado para pt-MZ, en e fr, incluindo erros operacionais relevantes.
- O hardening de produção já aplicado na migration `20261001123623_phase10_ppv_runtime_hardening` foi preservado forward-only no repositório.

Verificação read-only de produção:
- `purchase_ppv`: EXECUTE para `authenticated`, não para `anon`.
- `ppv_purchases`: RLS activa; SELECT para `authenticated`; INSERT/UPDATE/DELETE revogados.
- O controlo de escrita directo não foi contornado.

Limitação de certificação:
- O conector GitHub não expôs um run/status verde do CI correspondente, portanto o CI não é declarado verde.
- O teste comportamental completo não foi executado contra produção porque uma tentativa de escrita SQL foi bloqueada pelo controlo de segurança da execução de ferramentas. Não foram criados fixtures de teste persistentes em produção.
- Os gates transversais 0.6, 0.7, Vercel e certificação final da Fase 8 continuam materialmente abertos.

Estado: **FASE 10 IMPLEMENTADA / CERTIFICAÇÃO FINAL AINDA DEPENDENTE DOS GATES TRANSVERSAIS**.
