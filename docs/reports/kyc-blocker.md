# KYC BLOCKER — A.3.14

## 1. Reprodução observada

CI run: 36979532340
Job E2E original: 110751591478
Teste: `tests/e2e/journey-client-a2-a3.spec.ts`
Falha: `A.3.14 KYC_not_found`

Output relevante observado no job:

```
A.3.12 UI KYC state=pending
A.3.12 DB kyc_verifications=[{"id":"6dd82df6-...","user_id":"0fc094e1-...","status":"pending","provider":"manual",...}]
A.3.12 STORAGE prively-kyc=[2 files]
A.3.13 AAL1 approve HTTP=403 body={"code":"forbidden"}
A.3.13 AAL2 approve HTTP=200 body={"ok":true,"status":"approved"}
A.3.14 KYC read attempt=1 miss=no_data
A.3.14 KYC read attempt=2 miss=no_data
A.3.14 KYC read attempt=3 miss=no_data
A.3.14 KYC read attempt=4 miss=no_data
A.3.14 KYC read attempt=5 miss=no_data
```

O mesmo padrão ocorreu em tentativas repetidas do teste com utilizadores e KYC IDs diferentes.

## 2. Queries executadas pelo teste

O teste executa a mesma leitura de readback cinco vezes, através do Supabase client com service-role:

```sql
select id, status, reviewed_by, reviewed_at
from public.kyc_verifications
where user_id = '<createdUserId>'
  and status = 'approved'
order by reviewed_at desc
limit 1;
```

A query é repetida até cinco vezes, com espera incremental de 250 ms entre tentativas.

Antes desta leitura, o próprio teste confirma que a linha pending existe por:

```sql
select id, user_id, status, provider, doc_path, selfie_path
from public.kyc_verifications
where user_id = '<createdUserId>'
order by created_at desc
limit 1;
```

## 3. Contratos verificados antes da correcção

### AAL1
AAL1 recebe 403. Isto é esperado e confirma o guard de segurança.

### AAL2
AAL2 recebe HTTP 200 através de `/functions/v1/kyc-review`.

### RPC de aprovação
A função actualmente instalada é:

```text
public.approve_kyc(uuid, boolean, text, uuid)
```

O proprietário da função e da tabela `kyc_verifications` é `postgres`. A tabela tem RLS activo. Não existem overloads adicionais de `approve_kyc` na base Supabase verificada.

O teste SQL nativo `phase1_identity_roles_kyc_test.sql` aprova uma linha KYC através da mesma assinatura de quatro argumentos com `service_role` e confirma posteriormente `is_age_verified() = true`. O suite de base de dados está verde.

Não foram encontrados triggers em `kyc_verifications` que revertam ou eliminem a actualização.

## 4. Classificação da causa

### Causa: (e) Outro — falso positivo no contrato HTTP da Edge Function

A causa operacional identificada está no contrato da `kyc-review`: depois de `admin.rpc("approve_kyc", ...)` retornar sem erro, a função devolve imediatamente:

```json
{"ok":true,"status":"approved"}
```

A função não verifica o estado persistido de `kyc_verifications` antes de declarar sucesso.

Isto é incompatível com o comportamento exigido pelo E2E: o HTTP 200 está actualmente a significar apenas que a chamada RPC não devolveu erro, e não que o estado final aprovado ficou observável pelo cliente.

A evidência exclui, no estado actual, as hipóteses principais:
- (a) RLS não explica o blocker: o readback é feito com service-role e a leitura pending funciona.
- (b) erro transaccional completo não é consistente com o HTTP 200, ausência de erro RPC e a passagem do teste SQL directo.
- (c) uma race condition pura não é consistente com cinco readbacks consecutivos sem sucesso.
- (d) o teste não está a consultar uma tabela de outro utilizador nem um overload errado; o KYC ID e user ID vêm da mesma linha criada imediatamente antes da revisão.

## 5. Próxima correcção

A correcção deve tornar o contrato `kyc-review` verificável: depois de `approve_kyc`, ler novamente a linha pelo `kycId`, confirmar o estado esperado e só então devolver HTTP 200. Se o estado persistido não for observável, a função deve falhar explicitamente com um código determinístico, em vez de devolver falso sucesso.

Não há alteração de RLS, não há exposição de service-role no frontend e não há alteração do ledger.

## 6. Estado

Diagnóstico escrito antes da correcção.
Correcção de backend ainda não aplicada neste commit.
