# RELATÓRIO — FASE 3

## Funcionalidade concluída

Criação e gestão de canal com autorização server-side, criação via RPC, validação de creator, KYC e termos, verificação de handle e isolamento de dados de seed.

## Diagnóstico real

A produção já tinha `public.channels` e `public.create_creator_channel(text,text,text)`.

As causas confirmadas foram:
- `channels` não tinha `is_seed`;
- existia a policy ampla `channels_owner_write`;
- existia a policy legada `channels_read`;
- o RPC usava um erro agregado;
- a UI não tinha verificação de handle com debounce.

## Migrações aplicadas

- `20261002000000_phase3_channel_creation_hardening`
- `20261002001000_phase3_channel_creation_reconciliation`
- `20261002002000_phase3_channel_policy_final`
- `20261002003000_phase3_channel_public_policy_cleanup`

Aplicadas em produção Supabase `gaonupelgtpfthouyobh`.

## Contrato final

`create_creator_channel(text,text,text)` exige sessão, papel creator, termos actuais e verificação aprovada; valida handle, nome, bio e unicidade.

`check_channel_handle(text)` foi adicionado para disponibilidade server-side.

INSERT directo em `channels` por `authenticated` ficou proibido.

A policy legada `channels_read` foi removida.

## Seed data

O canal sintético real `criadora_test / Criadora de Teste` foi marcado em produção como `is_seed = true` e deixa de ser tratado como canal público.

A decisão de seed usada segue o ADR-010 existente.

## Frontend

`/estudio` continua protegido por `ExperienceGuard`.

`/estudio/conteudo` usa o RPC de criação.

O handle é normalizado, validado localmente e verificado no servidor com debounce de 400 ms.

Foram adicionadas mensagens específicas em pt-MZ, en e fr para os estados e erros da criação de canal.

## Testes adicionados

- `supabase/tests/database/phase3_channel_creation_test.sql`
- `supabase/tests/database/phase3_channel_seed_visibility_test.sql`

O CI passou a executar estas duas suites.

## Verificação executada

Produção Supabase: esquema, grants, policies, RPCs e marcação do seed foram verificados.

A suite completa de CLI/CI não foi executada nesta sessão. O ambiente local não conseguiu resolver `github.com`, impedindo o clone do repositório e a execução local da CLI.

Não são declarados como executados `supabase db reset`, `supabase db lint --local`, `npm run typecheck`, `npm run lint`, `npm run test` ou `npm run build`.

## Estado

Implementação funcional concluída.

Certificação final da Fase 3 ainda pendente de CI e confirmação da build publicada em Vercel.

