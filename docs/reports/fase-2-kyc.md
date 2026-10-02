# RELATÓRIO — PARTE 2 — KYC END-TO-END

Data: 2026-10-02
Branch: main
Supabase: gaonupelgtpfthouyobh
CI final: 37005708194
SHA certificado: de83b5b3d5d779ed188a544cf65e4cdac57f4042

## 1. Estado

A Parte 2 foi concluída e certificada.

A base KYC já existente foi reutilizada sem duplicar tabelas, RLS ou funções. As migrações funcionais de KYC já presentes foram reconstruídas e validadas no CI.

A superfície de submissão passou a usar o fluxo real `kyc-start`. O fallback manual foi corrigido para criar a submissão `pending` através de `submit_kyc`.

A função `kyc-start` foi publicada no Supabase na versão 33 com `verify_jwt=true` e CORS compatível com o restante da plataforma.

## 2. Backend e segurança

Schema remoto validado:
- `public.kyc_verifications` com RLS activo.
- Leitura própria e escrita própria apenas em estado `pending`.
- Gestão administrativa condicionada a `admin.kyc` / compliance.
- `approve_kyc` protegido contra execução por `authenticated`.
- `is_age_verified` depende de KYC aprovado e estado de perfil válido.
- `get_my_kyc_status` expõe apenas o estado do próprio utilizador.
- `get_admin_kyc_queue` exige `admin.kyc`.
- `kyc_manual_queue_weekly_volume_guarded()` expõe apenas a agregação autorizada.

Storage:
- Bucket real existente: `prively-kyc`.
- Bucket privado.
- Upload condicionado à pasta do próprio utilizador.
- Leitura administrativa através de URL assinada.
- Teste HTTP de acesso público: PASS, endpoint devolveu HTTP 400.

## 3. Frontend

### /verificacao
Ligado ao backend real:
- consulta `get_my_kyc_status`;
- upload de documento e selfie para `prively-kyc`;
- chama `kyc-start`;
- trata `pending`, `review`, `approved`, `rejected`;
- inclui loading, empty, error, offline, forbidden e success;
- possui mensagens pt-MZ, en e fr.

### /admin/kyc
Ligado ao backend real:
- fila via `get_admin_kyc_queue`;
- volume semanal via `kyc_manual_queue_weekly_volume_guarded`;
- abre documentos com URL assinada;
- aprova/recusa através da Edge Function `kyc-review`;
- estados de loading, empty, error, offline, forbidden e success.

### /boas-vindas
Ligado ao estado KYC real:
- bloqueia continuação sem KYC aprovado;
- mostra estado pendente/em análise/recusado;
- após aprovação libera o onboarding;
- estados loading, error, offline, forbidden e success.

O guard de experiência foi ajustado para permitir a rota `/boas-vindas` antes da aprovação do KYC, mantendo a verificação como gate da progressão.

## 4. Testes SQL

Suite:
`supabase/tests/database/phase2_kyc_test.sql`

Coberturas:
- existência da tabela e RLS;
- bucket privado;
- privilégio de execução de `approve_kyc`;
- privilégio de execução de `apply_kyc_result` restrito a `service_role`;
- volume semanal protegido;
- `get_my_kyc_status`;
- políticas de storage;
- 8 semanas consecutivas de volume manual;
- utilizador sem KYC aprovado não é age verified.

Output final do CI:
```
phase2_kyc_test.sql ... PASSED
Native SQL suites failed: 0
```

Além da suite específica, `phase1_identity_roles_kyc_test.sql` passou no mesmo runner e continua a provar a chamada protegida de `approve_kyc` por utilizador autenticado.

## 5. E2E

Suite executada:
`tests/e2e/journey-client-a2-a3.spec.ts`

Output real:
```
A.2.10 UI onboarding KYC gate=blocked
A.3.12 UI KYC state=pending
A.3.13 RLS admin-scoped AAL2 KYC read= approved row
A.3.14 KYC read attempt=1 ok
A.3.14 DB final KYC= approved
A.3.14 DB final profile= active + age_verified_at
A.3.14 UI onboarding KYC=approved

1 skipped
148 passed (1.7m)
```

O fluxo ponta a ponta cobre submissão, persistência em `pending`, aprovação administrativa, leitura AAL2, actualização de perfil e desbloqueio do onboarding.

## 6. CI global

Run:
`36992014658`

Resultado:
- quality: SUCCESS
- Edge Functions contract tests: SUCCESS
- database: SUCCESS
- e2e: SUCCESS
- CI: SUCCESS

Quality confirmou:
- migrations check: PASS
- Supabase gateway check: PASS
- page structure: PASS
- typecheck: PASS
- lint: PASS
- unit tests: PASS
- production source audit: PASS
- build: PASS

Database confirmou:
- rebuild from zero: PASS
- migrations lint: PASS
- KYC private storage HTTP test: PASS
- canonical database suite: PASS
- native SQL regression suites: PASS

Production Smoke para o mesmo SHA concluiu o job com sucesso, mas o teste de produção foi explicitamente skipped porque `PRIVELY_PRODUCTION_URL` não está configurado no ambiente de produção.

## 7. Correcções relevantes

| ID | Área | Correcção | Estado |
|---|---|---|---|
| P2-001 | KYC start | Fallback manual passou a criar `pending` através de `submit_kyc` | Corrigido |
| P2-002 | CORS | `kyc-start` recebeu CORS e OPTIONS compatíveis | Corrigido |
| P2-003 | Verification | /verificacao passou a usar `kyc-start` real | Corrigido |
| P2-004 | KYC Queue | fila e volume passaram a ler dados reais | Corrigido |
| P2-005 | Onboarding | estado real de KYC passou a bloquear/desbloquear progressão | Corrigido |
| P2-006 | SQL tests | corrigido erro de delimitador pgTAP introduzido no teste | Corrigido |


| P2-007 | KYC provider result | `apply_kyc_result` deixou de ser executável por `authenticated`; apenas `service_role` mantém execução | Corrigido |

## 8.1 Evidência live do endurecimento

Query executada no Supabase após a migração `20261002141500_phase2_kyc_apply_result_hardening`:
```
authenticated_execute=false
anon_execute=false
service_role_execute=true
security_definer=true
```

A suite `supabase/tests/database/phase2_kyc_test.sql` passou a ter 19 assertions, incluindo a prova de que `authenticated` não pode executar `apply_kyc_result`.

## 8. UNVERIFIED / dívida técnica

O caminho de provider externo continua condicionado às variáveis `KYC_START_URL`, `KYC_API_KEY` e `KYC_WEBHOOK_SECRET`. Não foi inventado contrato de fornecedor externo.

O smoke de produção continua sem execução efectiva porque `PRIVELY_PRODUCTION_URL` não está configurado no GitHub Actions.

## 9. Gate

Parte 2: CERTIFICADA.

CI definitivo após o endurecimento: `37005708194` SUCCESS. Production Smoke do mesmo SHA: `37005708448` SUCCESS.

Parte 3: não iniciada.

A execução pára aqui conforme a ordem do Superprompt 2.
