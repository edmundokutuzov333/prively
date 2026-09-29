# Baseline verificada — 2026-09-29

## Ambiente

- Node local: `v26.8.2` (o projeto exige `>=24 <25`; a baseline CI deve correr no Node 24).
- npm local: `11.19.1`.
- Supabase CLI local: indisponível.
- Docker local: indisponível.
- Supabase remoto: `gaonupelgtpfthouyobh`, PostgreSQL `17.6.1.166`, estado `ACTIVE_HEALTHY`.

## Resultados locais

| Comando | Resultado |
| --- | --- |
| `npm install --package-lock-only --no-audit --no-fund` | ✅ lockfile criado |
| `npm ci --no-audit --no-fund` | ✅ 613 pacotes instalados; avisos de engine por Node 26 |
| `npm run check:migrations` | ✅ 155 migrações, 0 versões duplicadas, 61 marcadores históricos |
| `npm run check:supabase-config` | ✅ 23 funções com `verify_jwt` explícito |
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ 0 erros; 1 warning de Fast Refresh em `src/app/session.tsx` |
| `npm run test` | ✅ 4 ficheiros, 10 testes |
| `npm run audit:production` | ✅ 72 ficheiros browser + 26 Edge Functions |
| `npm run build` | ✅; warnings de bundle grande e comentários de dependência |
| `supabase start` / `supabase db reset` / `supabase db lint --local` / `supabase test db` | ⚠️ não executados: CLI e Docker ausentes |
| `npx playwright test` | ⚠️ não executado nesta baseline; a suíte depende de serviços locais/externos ainda não configurados |

## Verificações remotas

- Supabase reportou 123 migrações no histórico remoto, sem versão duplicada no histórico remoto.
- Supabase reportou 23 Edge Functions ativas; webhooks/crons têm `verify_jwt=false` e as funções de utilizador têm `verify_jwt=true`.
- A conta Vercel ligada tem projetos `portfoliokutuzov`, `barber-os` e `txunabet2026`; não há projeto `prively`.
- O primeiro push foi publicado via workflow controlado: produção já não é disparada diretamente por `push` em `main`.

## Achados novos

- `N-01`: o ambiente de execução local não cumpre Node 24 e não tem Supabase CLI/Docker; a prova de reset da base de dados fica para CI/runner preparado.
- `N-02`: falta criar/importar o projeto Vercel `prively` e configurar o Environment `production` com revisores obrigatórios.
- `N-03`: falta um projeto Supabase de staging; não foi criado automaticamente porque é uma decisão/custo do dono do produto.
