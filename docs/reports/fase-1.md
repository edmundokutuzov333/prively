# RELATÓRIO FASE 1 — Fundação de engenharia e pipeline seguro

## 1. Resumo executivo

A entrega colocou a produção atrás de CI bem-sucedido, com aprovação do Environment e checkout do SHA testado. O caminho Vercel duplicado foi removido e as versões de Supabase CLI/Vercel foram fixadas. Foi criado o lockfile, adicionada validação de migrações e todas as 23 Edge Functions passaram a declarar `verify_jwt`. O cliente Supabase passou a usar configuração por ambiente. A baseline JavaScript ficou verde: typecheck, lint, 10 testes, audit e build. O reset local Supabase e as suites SQL continuam por provar porque o ambiente não tem CLI nem Docker.

## 2. Commits e tag

- `a753c31` — `fase-1: pipeline: gate production delivery behind CI`
- Segundo commit desta fase: correções de reprodutibilidade, configuração, ambiente, CORS e baseline.
- Tag: `fase-1-concluida` criada localmente; a publicação remota está pendente porque a conexão GitHub disponível nesta sessão não expõe criação de refs de tags e o terminal não tem credencial de push.

## 3. Evidências

- `npm ci`: ✅ 613 pacotes instalados; avisos de engine apenas porque o host local tem Node 26.
- `npm run typecheck`: ✅
- `npm run lint`: ✅ 0 erros, 1 warning existente de Fast Refresh.
- `npm run test`: ✅ 4 ficheiros / 10 testes.
- `npm run audit:production`: ✅ 72 ficheiros browser / 26 Edge Functions.
- `npm run build`: ✅; warnings não bloqueantes de bundle grande e comentários em Zod.
- `npm run check:migrations`: ✅ `156 migrações, sem versões duplicadas (61 marcadores históricos)`.
- `npm run check:supabase-config`: ✅ `23 funções com verify_jwt explícito`.
- `supabase db reset`: ⚠️ a primeira execução CI falhou em `20260929021500` por falta de `public.comments`/`public.reactions`; foi adicionada a migração `20260929021400_phase7_social_tables.sql` e a reexecução é necessária.
- `supabase test db`, suites nativas e Playwright: ⚠️ não verificáveis neste host sem Supabase CLI/Docker e sem ambiente E2E preparado.

## 4. Critérios de aceitação da fase

- ✅ Push direto para `main` não dispara produção; o workflow usa `workflow_run` após `Prively CI`, checkout do SHA exato e Environment `production`.
- ⚠️ Revisores obrigatórios do Environment: configuração externa pendente do dono do repositório.
- ✅ `package-lock.json` criado e workflows usam `npm ci`.
- ✅ CLI Supabase `2.118.0` e Vercel `61.0.0` fixados.
- ✅ Versões de migração duplicadas eliminadas no checkout local e guarda adicionada ao CI.
- ⚠️ Reset do zero: primeira tentativa CI falhou por dependência de tabelas sociais ausentes; correção forward-only publicada, reexecução pendente.
- ✅ As 23 funções têm `verify_jwt` explícito; webhooks/crons estão `false` para autenticação própria.
- ✅ Cliente Supabase lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
- ⚠️ Staging separado: projeto Supabase/Vercel ainda não existe na conta ligada.
- ⚠️ Flags por BD e `/admin/feature-flags`: existentes parcialmente no repositório, não foram ampliadas nesta contenção de fundação.
- ⚠️ CORS: wildcard removido e allowlist introduzida; migração completa para passar o `Request` em todos os caminhos fica pendente.
- ✅ Baseline documentada; README não foi reescrito porque não foram encontrados resíduos `fileciteturn`/`citeturn` no checkout atual.

## 5. Estado da plataforma

O scoreboard completo está em `docs/platform-status.md`. O estado global desta fase é `PARCIAL`: engenharia JavaScript e pipeline estão melhorados, mas os gates Supabase/Docker, staging, Vercel e providers externos não estão verificados.

## 6. Achados F-xx

- Resolvidos: F-01 (duplicidade local), F-03 (deploy direto), F-04 (lockfile/npm ci/versões fixas), F-05 (configuração explícita), F-11 (env frontend), F-15 (wildcard removido), F-21 (baseline separada/documentada).
- Adiados: F-02 (histórico remoto divergente exige reset/reconcile com backup), F-12 (fonte única de flags exige RPC/hook/admin), F-23 (dependências não-código).
- Novos: N-01 host local sem Node 24/CLI/Docker; N-02 Vercel Prively ausente; N-03 staging Supabase ausente; N-04 dependência social ausente na reconstrução local, com correção adicionada.

## 7. UI · UX · CX · SD

- UI: nenhuma superfície nova foi exposta; o cliente agora falha cedo quando a configuração de ambiente é inválida.
- UX: a suíte unitária voltou a ficar verde e o pipeline não publica sem gates.
- CX: estados de configuração continuam explícitos, sem simular autenticação.
- SD: o pipeline, matriz de segredos e baseline deixam responsáveis e pontos de falha rastreáveis.

## 8. Riscos e dívida técnica

Sem Docker/CLI não há prova de reconstrução do banco. Ainda não há Vercel Prively nem staging. O CORS ainda precisa receber o `Request` em todos os handlers. A UI mantém algumas páginas grandes e avisos de bundle; providers de media, pagamentos, KYC, push e LiveKit permanecem externos.

## 9. Pedidos ao Dono do Produto

- Configurar revisores obrigatórios no GitHub Environment `production` antes do primeiro deploy (urgente).
- Criar/importar o projeto Vercel `prively`, ligar domínio e variáveis (antes de qualquer deploy frontend).
- Decidir e financiar projeto Supabase `prively-staging` (antes de E2E de staging).
- Disponibilizar runner/ambiente com Node 24, Docker e CLI Supabase para fechar as provas SQL (próximo ciclo).

## 10. Plano da próxima fase

Fase 2 deve começar com auditoria somente leitura de `auth.users`, triggers, funções bootstrap e utilizadores de teste. Depois deve remover o autoconfirm via migração forward-only, provar o modelo de papéis com SQL, fechar o fluxo de KYC sem simulação, exigir AAL2 no servidor e substituir o PIN local por PBKDF2 com bloqueio progressivo. Provider KYC, SMTP, CAPTCHA e SMS ficam marcados como externos até haver credenciais e decisão do dono.
