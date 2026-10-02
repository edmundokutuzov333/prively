# RELATÓRIO — SUPERPROMPT 2: FUNDAÇÃO FUNCIONAL

Data: 2026-10-02
Branch: main
Supabase: gaonupelgtpfthouyobh

## 1. Resumo

A Parte 0 foi concluída anteriormente e certificada com CI verde.
A causa do A.3.14 foi identificada no E2E: o readback administrativo era executado com sessão AAL1, enquanto o RLS administrativo exige AAL2.
A Parte 1 fecha a fundação de identidade e autorização de papéis sem alterar RLS de KYC como workaround.
A estrutura de papéis já existente foi auditada na base remota e confirmada.
O helper `has_role()` está protegido contra consultas sobre outro utilizador.
A escrita administrativa de `user_roles` exige permissões de administração e AAL2.
Os campos sensíveis de `profiles` continuam protegidos server-side por trigger.
O fluxo `become-creator` usa autenticação real, valida KYC aprovado e idade verificada e concede o papel através de RPC service-role.
O grant é idempotente e auditado.
O frontend `/se-criadora` já estava ligado ao Edge Function e foi coberto por E2E real.
Suite final do CI: 148 passed, 1 skipped, 0 failed.

## 2. Parte 0 — Desbloqueio CI

Diagnóstico: `docs/reports/kyc-blocker.md`.
Causa raiz: teste E2E mal isolado entre client service-role e sessão administrativa AAL1.
Correção: separar o client service-role do client autenticado e validar o readback KYC administrativo com AAL2.
Evidência final do E2E: A.3.13 AAL1 = 403, A.3.13 AAL2 = 200, A.3.14 KYC read = ok, profile read = ok.
Output final da suite após a correcção: 148 passed, 1 skipped, 0 failed no CI da versão actual da suite.

## 3. Parte 1 — Identidade

### Backend existente auditado e certificado

`public.user_roles` existe, tem RLS activo e usa o enum `public.app_role`.
Papéis existentes: client, creator, agency, moderator, support, finance, compliance e admin.
`public.has_role(uuid, app_role)` é SECURITY DEFINER, limitado ao próprio utilizador quando existe JWT e executável por authenticated.
A policy de leitura própria existe.
A policy administrativa usa `private.is_platform_admin()`, que deriva de `has_permission(...,'admin.control_room')` e exige AAL2 para permissões `admin.*`.
O trigger `trg_profiles_protected_fields` protege `age_verified_at`, `status` e `self_excluded_until`.
O RPC `grant_creator_role(uuid)` só é executável por service_role, exige perfil activo, idade verificada, ausência de auto-exclusão activa e KYC aprovado.
O grant é idempotente e escreve `creator_role_granted` no `audit_log`.

### Testes acrescentados

`supabase/tests/database/phase1_creator_role_test.sql`
Foi expandido para 10 asserts, incluindo escrita administrativa de role com AAL2, bloqueio de escrita com AAL1, grant aprovado, idempotência, auditoria e bloqueio sem KYC.

`tests/e2e/phase1-identity-creator.spec.ts`
Foram adicionados dois fluxos reais:
1. Utilizador com KYC aprovado entra no frontend, usa "Sê criadora", recebe `creator` e chega a `/se-criadora/passos`.
2. Utilizador sem KYC aprovado é bloqueado em `/se-criadora` e não recebe o papel.

### Frontend

`src/features/public/BecomeCreator/BecomeCreator.tsx` já estava ligado ao backend real através de `become-creator`.
A superfície implementa os estados loading, unauthenticated, pending, forbidden, success, error e offline.
O botão não concede o papel localmente: chama a Edge Function real.
A navegação para onboarding ocorre apenas depois de resposta positiva do backend.

### CI real

Run: 36988763106
Commit certificado: bc312851bc59fd5480196798ec964a499dd5c4f2
Jobs:
- quality: success
- database: success
- Edge Functions contract tests: success
- e2e: success

Suite E2E: 148 passed, 1 skipped, 0 failed.

## 4. Parte 2 — KYC

Não executada nesta etapa. Aguarda avanço explícito para a Parte 2.

## 5. Bugs encontrados e corrigidos

| Identificador | Parte | Severidade | Correcção | Commit |
|---|---|---|---|---|
| A.3.14 | Parte 0 | Alta | Separação de clients e readback AAL2 no E2E | 651e576 / 207ca3d / 05e9fa3 |
| P1-E2E | Parte 1 | Média | Falta de cobertura ponta a ponta do fluxo Sê criadora | c7c8cc6 |
| P1-ROLE-TEST | Parte 1 | Média | Falta de prova pgTAP para escrita administrativa de roles | cc076c2 / bc31285 |

## 6. Dívida técnica restante

A suite global ainda tem 1 teste ignorado, conforme a contagem real do CI.
Existem warnings de build relacionados com comentários de Zod/Rollup e chunks acima de 500 kB, sem falha do gate.
Há divergências históricas entre timestamps de algumas migrações locais e equivalentes remotos, já documentadas e tratadas como forward-only.

## 7. Estado

Parte 0: CONCLUÍDA.
Parte 1: CONCLUÍDA.
Parte 2: NÃO INICIADA.

Não houve alteração de SERVICE_ROLE_KEY no frontend.
Não houve desactivação de RLS.
Não houve alteração destrutiva no ledger.

## 8. Pronto para Superprompt 2, Parte 2

SIM do ponto de vista técnico da Parte 1.
A Parte 2 não foi iniciada nesta execução.
