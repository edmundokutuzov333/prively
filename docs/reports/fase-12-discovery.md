# RELATÓRIO — FASE 12

Funcionalidade concluída: Descoberta real e seguir

## Migrações aplicadas

- `20261001145322_phase12_discovery_runtime_contract` aplicada no Supabase de produção.
- A migração é forward-only e reutiliza `channels` e `follows` existentes.

## Lógica de descoberta

- Nova RPC `public.discover_channels(text,text,text,text,integer,integer)`.
- Filtragem server-side por handle/display_name, cidade, bairro e província.
- Exclusão server-side de `channels.is_seed = true`.
- Exclusão de owners cujo `profiles.status <> 'active'`.
- Exclusão de canais escondidos pelo utilizador.
- Exclusão de pares bilateralmente bloqueados.
- Retorna `follower_count` real e `is_following` real.
- Limite e offset são limitados no servidor.

## RLS e grants

- `follows` mantém RLS activo.
- `authenticated` perdeu INSERT/UPDATE/DELETE directo em `follows`.
- `authenticated` mantém SELECT apenas dentro da política própria/owner.
- `follow_channel(uuid)` permanece o caminho protegido de seguir.
- `unfollow_channel(uuid)` permanece o caminho protegido de deixar de seguir.
- Índice `follows_channel_id_idx` criado para contagem de seguidores.
- Índices de suporte para descoberta criados em `channels` e `profiles`.

## Frontend

- `/descobrir` actualizado em `src/pages/ClientCorePages.tsx`.
- Descoberta passou de leitura directa de `channels` para `discover_channels`.
- Adicionado filtro de bairro server-side.
- Estado de loading explícito.
- Estado vazio tem acção para alargar localização, limpar filtros ou actualizar.
- Seguir/deixar seguir actualiza a UI imediatamente após o RPC sem reload.
- O resultado mostra a contagem real de seguidores.
- Swipe de descoberta mantém-se ligado aos dados reais.
- Traduções adicionadas em pt-MZ, en e fr.

## Critérios de aceitação

- [✓] `/descobrir` nunca devolve `is_seed=true` para utilizadores reais.
- [✓] Owners não activos são excluídos no servidor.
- [✓] Filtros por handle, cidade e bairro são executados server-side.
- [✓] Seguir/deixar seguir reflecte-se sem reload.
- [✓] Estado vazio oferece acção útil.

## Testes executados

Smoke transaccional real no Supabase de produção:
- pesquisa por handle: PASS
- seed não aparece: PASS
- owner suspenso não aparece: PASS
- filtro combinado Maputo/Centro: PASS
- estado inicial `is_following=false`: PASS
- `follow_channel`: PASS
- `is_following=true` após seguir: PASS
- `follower_count=1`: PASS
- `unfollow_channel`: PASS
- `is_following=false` e `follower_count=0` após deixar de seguir: PASS
- toda a prova terminou com `ROLLBACK`; dados temporários ficaram a zero.

Prova remota pós-rollback:
- `p12_channels = 0`
- `p12_profiles = 0`
- `p12_follows = 0`
- `discover_channels` executável por `authenticated`.
- `follows` INSERT directo por `authenticated`: false.
- `follows` DELETE directo por `authenticated`: false.

Suite versionada:
- `supabase/tests/database/phase12_discovery_test.sql`.
- 22 assertions pgTAP.
- A execução local deste ficheiro não foi possível nesta sessão porque o projecto de trabalho não pôde clonar o GitHub por falha de DNS para `github.com`.

## CI

- A suite Phase 12 foi criada e está pronta para CI.
- Não foi alterado o `.github/workflows/ci.yml` canónico.
- Foi criado `.github/workflows/phase12-discovery.yml`, dedicado à Fase 12, que faz `supabase start`, `supabase db reset` e executa `supabase test db supabase/tests/database/phase12_discovery_test.sql`.
- O workflow está versionado na `main`; o run do GitHub correspondente ainda não é observável através do wrapper ligado nesta sessão.

## Bugs conhecidos / UNVERIFIED

- Typecheck/lint/build completos não foram executados nesta sessão porque o repositório não pôde ser clonado no runner local por falha de resolução DNS.
- Execução pgTAP completa da suite Phase 12 em `supabase test db` não foi executada nesta sessão.
- A prova funcional server-side real foi executada directamente contra produção e passou.
- Vercel, blockers 0.6/0.7 e certificação final da Fase 8 continuam fora do perímetro desta fase.

## Documentação

- `docs/decisions.md` actualizado com ADR-016.
- `docs/STATE.md` actualizado.
- `docs/reports/fase-12-discovery.md` este relatório.

Pronto para a Fase 13: não.

Falta fechar a evidência CI/pgTAP da suite Phase 12 antes de considerar a certificação final como verde.