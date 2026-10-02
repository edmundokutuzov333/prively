# RELATÓRIO — FASE 1 — IDENTIDADE

Data: 2026-10-02
Branch: main
CI final: 36988763106
SHA final: bc312851bc59fd5480196798ec964a499dd5c4f2
Supabase remoto: gaonupelgtpfthouyobh

## 1. Resumo

A Parte 1 do Superprompt 2 foi concluída e certificada com CI verde.

A base de identidade já existente foi reutilizada. Não foram duplicados `app_role`, `user_roles`, `has_role` nem o trigger de protecção de perfis.

Foi adicionada a concessão atómica do papel `creator`, condicionada a KYC aprovado, idade verificada e perfil activo.

Foi criada e publicada a Edge Function `become-creator`.

A rota efectiva `/se-criadora` da aplicação principal foi ligada ao componente funcional `BecomeCreator`.

A jornada E2E cobre KYC aprovado e utilizador sem KYC aprovado.

## 2. Backend

### Migração

Ficheiro:

`supabase/migrations/20261002080000_phase1_creator_role_grant.sql`

Função:

`public.grant_creator_role(uuid)`

Regras:
- utilizador deve existir
- perfil deve estar activo
- `age_verified_at` deve existir
- auto-exclusão não pode estar activa
- deve existir KYC aprovado
- concessão é idempotente
- concessão escreve `creator_role_granted` no `audit_log`
- execução restringida a `service_role`

A migração foi aplicada no projecto Supabase remoto acessível.

### Edge Function

Ficheiro:

`supabase/functions/become-creator/index.ts`

Comportamento:
- JWT obrigatório
- usa `has_role()` para verificar o papel actual
- lê o KYC do próprio utilizador com RLS
- bloqueia `pending` e `review`
- exige KYC `approved`
- confirma `is_age_verified()`
- executa `grant_creator_role()` pelo client service-role
- responde com estado explícito

Gateway configurado com `verify_jwt = true`.

## 3. Frontend

Componente funcional:

`src/features/public/BecomeCreator/BecomeCreator.tsx`

Estados implementados:
- loading
- empty
- forbidden
- success
- error
- offline

A rota efectiva da aplicação principal:

`/se-criadora`

passou a usar directamente `BecomeCreator`.

Após concessão do papel, o utilizador é encaminhado para:

`/se-criadora/passos`

O botão público existente em `PublicNav` continua a apontar para `ROUTES.BECOME_CREATOR`.

## 4. i18n

Paridade mantida em:
- `src/lib/i18n/pt-MZ.json`
- `src/lib/i18n/en.json`
- `src/lib/i18n/fr.json`

Incluídas mensagens para:
- autenticação
- KYC pendente
- KYC obrigatório
- erro de permissões
- indisponibilidade de verificação
- concessão do papel
- retry
- ligação para verificação

## 5. Testes SQL

Suite:

`supabase/tests/database/phase1_identity_roles_kyc_test.sql`

Output real relevante:

```
1..18
ok 5 - protected status cannot be changed by normal user
ok 6 - protected age_verified_at cannot be changed
ok 7 - protected self exclusion cannot be changed
ok 8 - unassigned admin role returns false
ok 11 - approved KYC enables age verification
ok 12 - rejected KYC disables age verification
ok 13 - authenticated cannot execute approve_kyc
ok 14 - role read RLS policy exists
ok 15 - role write RLS policy exists
ok 16 - KYC read RLS policy exists
ok 17 - KYC write RLS policy exists
ok 18 - KYC storage is private
PASSED: phase1_identity_roles_kyc_test.sql
```

## 6. E2E

Suite consolidada:

`tests/e2e/phase1-identity-creator.spec.ts`

Cenários:
1. KYC aprovado -> botão de creator -> concessão real do papel -> onboarding -> verificação do papel e audit log.
2. Sem KYC aprovado -> bloqueio -> ligação para verificação -> ausência do papel creator.

Output real da suite completa no CI:

```
148 passed (1.8m)
1 skipped
0 failed
```

## 7. Evidências globais

CI:
- Run: 36988763106
- SHA: bc312851bc59fd5480196798ec964a499dd5c4f2
- database: SUCCESS
- quality: SUCCESS
- Edge Functions contract tests: SUCCESS
- e2e: SUCCESS
- CI: SUCCESS

Production Smoke:
- Run: 36988763193
- SHA: bc312851bc59fd5480196798ec964a499dd5c4f2
- result: SUCCESS

Quality:
- migrations check: OK
- Supabase config check: OK
- page structure: OK
- typecheck: SUCCESS
- lint: SUCCESS
- unit tests: SUCCESS
- production source audit: SUCCESS
- build: SUCCESS

## 8. Bugs encontrados e corrigidos

| ID | Área | Severidade | Correcção | Estado |
|---|---|---:|---|---|
| P1-001 | Routing | Alta | `/se-criadora` passou a usar o fluxo funcional real | Corrigido |
| P1-002 | E2E | Média | Suite duplicada de creator consolidada numa única suite | Corrigido |
| P1-003 | E2E | Média | Fixtures ajustados ao limite real de `profiles.handle` | Corrigido |
| P1-004 | Quality | Baixa | Import obsoleto removido de `App.tsx` | Corrigido |

## 9. Dívida técnica restante

Existe uma camada histórica de routing com páginas equivalentes. Nesta parte foi corrigida apenas a rota efectiva necessária para a fundação de identidade.

Não existe um segundo projecto Supabase de staging separado disponível neste contexto. A migração foi aplicada e validada no projecto remoto acessível.

## 10. Pedidos ao Dono do Produto

Nenhum bloqueio de produto é necessário para a Parte 2.

## 11. Pronto para Superprompt 3

Não. Ainda faltam as Partes 2, 3 e 4 do Superprompt 2.

A execução deve parar aqui.