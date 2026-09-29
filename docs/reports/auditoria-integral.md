# Auditoria Integral da Prively

**Data da sessão:** 29 de Setembro de 2026  
**Branch:** `main`  
**Último commit de código antes deste relatório:** `9a02f7befef75c205be6366a94a620133e364273`  
**Estado da execução:** **PARCIAL / NÃO CONCLUÍDA**

## 1. Resumo executivo

A baseline real encontrou uma base de CI com qualidade, typecheck, lint, testes unitários, audit de produção e build verdes, mas a suite de base de dados e o E2E estavam vermelhos.  
O Supabase remoto tem 127/127 tabelas públicas com RLS activo e `reconcile_ledger()` devolve 0.  
A cadeia de hash do `audit_log` está íntegra e existem triggers de append-only.  
Foram encontrados bugs reais em suites SQL, no contrato de mensagem, no campo de heartbeat de chamadas e na configuração do E2E.  
Foram também endurecidas funções `SECURITY DEFINER` e políticas RLS no código, sem aplicar migrações persistentes no projecto remoto.  
O acesso de compliance foi endurecido para AAL2 no servidor.  
A suite ainda não foi executada novamente contra o novo commit porque o conector GitHub utilizado nesta sessão não iniciou um novo workflow para os commits feitos pela API Git.  
A Vercel está a devolver falha por rate limit de deployment nos três checks activos e o projecto Prively não está visível na API Vercel ligada à sessão.  
Existe drift material entre migrações locais e a história remota, pelo que não é seguro fazer `db push` sem reconciliação explícita.  
Por isso a Prively **não é declarada pronta para produção** nesta execução.

## 2. Âmbito coberto

### Coberto com evidência directa

- GitHub: branch `main`, commits, workflows, jobs, logs e ficheiros do repositório.
- Supabase: estado do projecto, tabelas, RLS, políticas, funções, grants, constraints, ledger, audit log, feature flags, migrações remotas, Edge Functions e logs.
- Vercel: checks GitHub associados ao repositório e tentativa de descoberta do projecto.
- CI: execução real do workflow `Prively CI #627`.
- Base de dados: `supabase db reset`, `supabase db lint --local`, `supabase test db` e suites SQL.
- Frontend: build, testes unitários, guards, configuração de ambiente e Playwright.
- Edge Functions: estado remoto, `verify_jwt`, código de webhooks, worker media e LiveKit.
- Segurança: RLS, SECURITY DEFINER, grants, AAL2, audit log, storage e função de reconciliação.

### Não executado nesta sessão

- Não foi feito clone local porque o runtime não conseguiu resolver `github.com`.
- Não foi feito deploy para Vercel nem para Supabase.
- Não foi executado um novo GitHub Actions para os commits de correcção.
- Não foi executado `k6`.
- Não foi executado `concurrency-spend.mjs`.
- Não foi feita matriz completa com JWTs reais para todos os papéis.
- Não foi validada cada integração externa em sandbox com credenciais reais.
- Não foi feita verificação end-to-end real com pagamentos, KYC, LiveKit, SMS, push ou fornecedores de moderação.
- Não é possível confirmar headers finais de produção enquanto o deployment Vercel não estiver verificável.

## 3. Baseline real

Fonte: GitHub Actions `Prively CI`, run `36586140102`, run #627, commit `277377034a75346127136bdda9cb23b094e8d855`.

### Quality

- `npm ci --no-audit --no-fund`: **PASS**
- `npm run check:migrations`: **PASS**
- `npm run check:supabase-config`: **PASS**
- `npm run typecheck`: **PASS**
- `npm run lint`: **PASS**
- `npm run test`: **PASS**, 6 ficheiros, 16 testes.
- `npm run audit:production`: **PASS**, 78 ficheiros browser + 35 Edge Function files inspeccionados.
- `npm run build`: **PASS**, mas com avisos de esbuild/chunking. Logo não satisfaz ainda a definição estrita de "build sem avisos".

Trecho real:

```text
Test Files  6 passed (6)
Tests       16 passed (16)
Production audit passed: 78 browser files and 35 Edge Function files inspected.
vite v7.3.6 building client environment for production...
Use build.rollupOptions.output.manualChunks to improve chunking
```

### Edge Functions

Job `109467220857`: **PASS**.

### Database

Job `109467221260`:

- Start local Supabase: **PASS**
- `supabase db reset`: **PASS**
- `supabase db lint --local`: **PASS**
- `supabase test db`: **FAIL**
- Native SQL regression suites: **FAIL**

O `supabase test db` registou 15 ficheiros, 112 testes, resultado FAIL.

Falhas reais da baseline:

1. `creator_terms_native_test.sql`: comparação textual de `0` contra `0.00`.
2. `phase5_content_media_test.sql`: fixture usava Creator Terms `1.0` quando a versão contratual era `1.0.0`.
3. `phase5_hardening_test.sql`: declarava `plan(16)` mas executava 17 asserções.
4. `phase7_social_realtime_test.sql`: critério anti-tautologia procurava uma forma de alias que não correspondia à política real.
5. `phase7_social_realtime_test.sql`: contrato local de `call_sessions.last_heartbeat_at` não era reconstruído de forma determinística.
6. `send_message_v2_core`: `message_id=message_id` era ambíguo em PL/pgSQL.

Falha de infraestrutura no harness nativo:

```text
ERROR: function plan(integer) does not exist
```

A causa é o executor nativo chamar psql sem carregar `pgtap` e sem normalizar o search_path.

### E2E

Job `109467577445`: **FAIL**.

Resultado real:

- 105 falharam
- 34 passaram
- 1 foi skipped

A leitura do frontend mostra que o E2E não fornecia `VITE_SUPABASE_URL` e a chave publishable que `src/lib/env.ts` exige. Os guards e a navegação dependem desse bootstrap. A correcção foi introduzida no workflow, mas ainda não foi reexecutada pelo Actions.

## 4. Evidência Supabase remota

Projecto: `prively`, ref `gaonupelgtpfthouyobh`, estado `ACTIVE_HEALTHY`, PostgreSQL 17.6.1.166, região `eu-west-1`.

### RLS

Consulta remota:

```text
rls_on      127
public_tables 127
rls_off       0
```

Resultado: **127/127 tabelas públicas com RLS**.

### Ledger

```text
reconcile_ledger_result = 0
wallet_negative_rows = 0
creator_pending_negative_rows = 0
ledger_rows = 0
credits = 0
debits = 0
```

A reconciliação actual está limpa. O ledger remoto está vazio, portanto a evidência não prova ainda comportamento financeiro sob transacções reais nem concorrência.

### Audit log

Colunas remotas:
`actor_id`, `event_type`, `target_type`, `target_id`, `reason`, `metadata`, `previous_hash`, `event_hash`, `created_at`.

Triggers:

```text
audit_log_hash       BEFORE INSERT
audit_log_immutable  BEFORE DELETE OR UPDATE
```

Verificação da cadeia:

```text
audit_hash_breaks = 0
```

### Funções SECURITY DEFINER

Baseline remota tinha múltiplas funções com:

```text
search_path=public
```

quando o contrato exigido é `public, pg_temp`.

Foi adicionada uma migração forward-only que normaliza todas as funções públicas `SECURITY DEFINER` para:

```text
search_path=public, pg_temp
```

A migração foi testada contra a estrutura remota dentro de `BEGIN/ROLLBACK` e devolveu:

```text
rls_off = 0
unsafe_security_definers = 0
heartbeat_field = 1
message_fix = true
```

Nada desta validação transaccional foi persistido no projecto remoto.

### AAL2

`has_permission()` já bloqueia permissões `admin.*` quando o JWT não tem AAL2. Isso fornece a barreira de servidor para:

- `get_admin_kyc_queue`
- `get_admin_users`
- `approve_kyc`
- outras operações que passam por `has_permission`.

Foi detectada uma lacuna real em `phase8_can_compliance_read()`: o acesso de compliance dependia apenas do papel. Foi corrigido no código para exigir `auth.jwt()->>'aal' = 'aal2'`.

A correcção foi validada por uma transacção remota com rollback.

## 5. Drift de migrações

Comparação por prefixo de versão:

- migrações no repo: 175
- migrações remotas: 123
- versões só locais: 95
- versões só remotas: 43
- duplicados locais: 0

Isto é drift material. Existem também vários ficheiros que são marcadores de reconciliação/no-op históricos.

**Estado: BLOQUEADOR.**

Não deve ser executado `supabase db push` antes de uma reconciliação formal entre a história remota e o conjunto local.

## 6. Edge Functions e webhooks

Funções activas detectadas remotamente: 23.

Configuradas no `supabase/config.toml`: 28 entradas.

Cinco funções configuradas não aparecem como deployments activos no projecto remoto:

- `media-dispatch`
- `live-enforcer`
- `payments-reconcile`
- `kyc-start`
- `kyc-webhook`

Isto deve ser reconciliado antes de declarar o pipeline completo.

O `config.toml` tem `verify_jwt=true` explícito para funções autenticadas e `false` para webhooks, crons e workers que fazem autenticação própria.

### Pagamentos

`payments-webhook` implementa:

- HMAC
- timestamp opcional
- `sha256(rawBody)` quando não existe event ID
- idempotência através de `payment_webhook_events`
- quarentena de erros permanentes
- persistência do evento antes do processamento

Ainda não foi executado um webhook sandbox real nesta sessão.

### LiveKit

`livekit-webhook` usa `WebhookReceiver` do SDK.
`livekit-token` emite token efémero com TTL de 5 minutos.
O código de billing server-side está presente para chamadas e live sessions.

Não foi validada uma sala LiveKit real nesta sessão.

### Media worker

`process-media-job` valida:
- token interno
- ownership e estado do job
- claim atómico
- `processing`
- `queued/failed/blocked`
- recuperação de jobs
- SHA-256 server-side
- HMAC para processadores externos
- auditoria de acesso ao processamento.

`media-dispatch` valida `x-prively-job-token` contra Vault/secret RPC e chama o worker interno.

Não houve prova de deployment activo do `media-dispatch` no projecto remoto nesta sessão.

## 7. Matriz de testes

| Área | Teste | Baseline | Após correcção | Evidência |
|---|---|---:|---:|---|
| Node | npm ci | PASS | não reexecutado | CI #627 |
| TypeScript | typecheck | PASS | não reexecutado | CI #627 |
| Lint | lint | PASS | não reexecutado | CI #627 |
| Unit | Vitest | 16/16 PASS | não reexecutado | CI #627 |
| Audit | audit:production | PASS | não reexecutado | CI #627 |
| Build | Vite | PASS com warnings | não reexecutado | CI #627 |
| DB reset | Supabase | PASS | não reexecutado | CI #627 |
| DB lint | Supabase | PASS | não reexecutado | CI #627 |
| DB canonical | pg_prove | FAIL | corrigido em source, não reexecutado | CI #627 |
| Native pgTAP harness | psql | FAIL | harness corrigido, não reexecutado | commit `3ad01c1` |
| E2E | Playwright | 34/140 PASS | env corrigido, não reexecutado | CI #627 |
| RLS | 127 tabelas | 127/127 | migração adicionada | SQL remoto |
| Ledger | reconcile | PASS | PASS observado | SQL remoto |
| Audit chain | hash | PASS | PASS observado | SQL remoto |
| Concurrency spend | script | NÃO EXECUTADO | NÃO VERIFICADO | sem runner nesta sessão |
| k6 | carga | NÃO EXECUTADO | NÃO VERIFICADO | sem runner nesta sessão |

## 8. Matriz RLS resumida

A condição estrutural global está verde: 127/127 tabelas têm RLS.

Políticas permissivas múltiplas foram encontradas em várias tabelas. Isto é actualmente tratado como ponto de hardening e revisão de composição de políticas, não como prova automática de fuga de dados.

Casos críticos de comunicação são testados pela suite Phase 7:
- `messages_member`
- `message_attachments_member_read`
- `can_view_post`
- contratos privados de chat
- funções internas de billing.

A matriz completa de combinações JWT por papel ainda está **NÃO VERIFICADA**.

## 9. Integrações externas

| Integração | Estado | Evidência | Falta |
|---|---|---|---|
| PaySuite | NÃO VERIFICADO | Edge Function activa + HMAC no código | sandbox/credenciais reais |
| KYC | PARCIAL | funções e código presentes; `kyc-webhook` não aparece deployed | deployment + sandbox |
| LiveKit | PARCIAL | token/webhook activos | sala real + billing real |
| Media provider | NÃO VERIFICADO | worker exige token/HMAC e falha fechado sem configuração | sandbox e credenciais |
| Push provider | REAL·FLAG | worker activo; `feature_flags.push=false` | activar somente após validação |
| Tradução | REAL·FLAG | `translate-message` activo; flag false | provider sandbox |
| IA | REAL·FLAG | `ai-response-assistant` activo; flag false | provider sandbox |
| Moderação externa | REAL·FLAG | função activa; flag de moderação true | prova do fornecedor |
| SMS/Safety | BLOQUEADO·EXTERNO | `safety-alert-dispatch` activo mas safety alerts false | provider e credenciais |
| Vercel | BLOQUEADO·EXTERNO | checks devolvem deployment rate limited | janela de rate limit + projecto acessível |

## 10. Bugs identificados e corrigidos

| ID | Severidade | Causa raiz | Correcção | Commit | Teste |
|---|---|---|---|---|---|
| AUD-001 | 🔴 | harness pgTAP não carregava extensão | carregar pgTAP + search_path | `3ad01c1` | native SQL harness |
| AUD-002 | 🟡 | comparação textual `0` vs `0.00` | comparar numeric | `3ad01c1` | creator terms |
| AUD-003 | 🟠 | fixture usava versão `1.0` | alinhar com `1.0.0` | `3ad01c1` | phase5 media |
| AUD-004 | 🟡 | plan dizia 16, suite executava 17 | plan 17 | `3ad01c1` | phase5 hardening |
| AUD-005 | 🟠 | teste Phase 7 tinha heurística incorrecta | verificar política real + heartbeat field | `3ad01c1` | phase7 |
| AUD-006 | 🔴 | `message_id=message_id` ambíguo | variável `v_message_id` + alias | `3ad01c1` | send_message_v2_core |
| AUD-007 | 🔴 | SECURITY DEFINER com search_path aberto | `public, pg_temp` + fail-closed policy | `3ad01c1` | phase10 security |
| AUD-008 | 🔴 | compliance não exigia AAL2 | guard AAL2 em `phase8_can_compliance_read` | `8be12a0` | phase10 sensitive access |
| AUD-009 | 🟠 | E2E sem env Supabase | injectar URL + publishable key no job | `3ad01c1` | Playwright |
| AUD-010 | 🟡 | novas suites não estavam no harness CI | adicionar ao array de suites | `9a02f7b` | CI config |

## 11. Riscos e dívida técnica

1. Drift entre as 175 migrações locais e 123 remotas.
2. Novo CI ainda não foi executado neste commit.
3. Vercel bloqueada por rate limit.
4. Testes de carga ausentes.
5. Concorrência financeira não provada.
6. Ledger remoto sem transacções reais nesta amostra.
7. Cinco Edge Functions configuradas mas não detectadas como deployed.
8. Integrações externas sem prova sandbox.
9. Build ainda gera warnings.
10. Matriz completa JWT × papel × recurso não foi executada.
11. Acessibilidade Playwright não ficou validada porque a execução E2E estava bloqueada por bootstrap.
12. Paridade integral de i18n ainda não foi demonstrada.

## 12. Pedidos ao Dono do Produto

1. Autorizar janela controlada para reconciliar história de migrações sem `db push` cego.
2. Disponibilizar acesso verificável ao projecto Prively na Vercel ou remover os três webhooks/checks antigos que estão a originar os três status rate-limited.
3. Disponibilizar credenciais sandbox dos fornecedores que precisam de validação real.
4. Confirmar política legal final de retenção, porque `retention_days` está em estado `pending_legal_configuration`.
5. Depois de CI verde, aprovar separadamente o deployment para staging e só depois produção.

## 13. Próxima sessão

Prioridade 1: executar CI para o SHA actual e corrigir qualquer falha residual.  
Prioridade 2: reconciliar migrações local/remoto.  
Prioridade 3: executar matriz real de RLS/AAL2 com fixtures efémeras e testes de concorrência.  
Prioridade 4: validar deployments e workers ausentes.  
Prioridade 5: executar k6 e `concurrency-spend.mjs` contra staging.  
Prioridade 6: fechar headers, i18n, acessibilidade e avisos de build.

## 14. Estado final

**Não foi criada tag de conclusão.**  
**Não foi feito deploy em produção.**  
**Nenhuma alteração persistente foi aplicada ao schema remoto durante a validação das novas migrações.**
