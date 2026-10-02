# KYC BLOCKER, A.3.14

## 1. Reprodução observada

CI run: 36979532340
Job E2E original: 110751591478
Teste: `tests/e2e/journey-client-a2-a3.spec.ts`
Falha: `A.3.14 KYC_not_found`

Output real observado:

```
A.3.12 UI KYC state=pending
A.3.12 DB kyc_verifications=[{"id":"e97c74f9-b358-4651-9517-2a521e55d0f1","user_id":"c5472007-3b66-4d3d-a805-47eac88a5282","status":"pending","provider":"manual",...}]
A.3.12 STORAGE prively-kyc=[2 files]
A.3.13 AAL1 approve HTTP= 403 body= {"code":"forbidden"}
A.3.13 AAL2 approve HTTP= 200 body= {"ok":true,"status":"approved"}
A.3.14 KYC read attempt=1 miss=no_data
A.3.14 KYC read attempt=2 miss=no_data
A.3.14 KYC read attempt=3 miss=no_data
A.3.14 KYC read attempt=4 miss=no_data
A.3.14 KYC read attempt=5 miss=no_data
```

O mesmo padrão foi reproduzido com vários utilizadores e KYC IDs diferentes no mesmo job.

## 2. As queries do A.3.14

O readback final é este:

```sql
select id, status, reviewed_by, reviewed_at
from public.kyc_verifications
where user_id = '<createdUserId>'
  and status = 'approved'
order by reviewed_at desc
limit 1;
```

A query é repetida cinco vezes, com espera incremental de 250 ms.

Antes da revisão, o teste lê a mesma tabela e confirma que a linha existe:

```sql
select id, user_id, status, provider, doc_path, selfie_path
from public.kyc_verifications
where user_id = '<createdUserId>'
order by created_at desc
limit 1;
```

As três verificações de preparação para a revisão também fazem:
1. POST AAL1 para `/functions/v1/kyc-review`, esperado 403.
2. POST AAL2 para `/functions/v1/kyc-review`, esperado 200.
3. Readback da linha aprovada.

## 3. Diagnóstico manual

O teste cria inicialmente um único client:

```ts
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false }
});
```

Este client funciona como service-role e lê correctamente a linha KYC `pending`.

Mais tarde, o mesmo objecto executa:

```ts
await admin.auth.signInWithPassword({
  email: adminEmail,
  password: adminPassword
});
```

Esse login cria uma sessão em memória no próprio client. `persistSession:false` impede persistência, mas não impede a sessão em memória. Depois do login, os pedidos feitos por `admin.from(...)` passam a usar o access token da sessão actual.

Consequentemente, este código:

```ts
admin.from('kyc_verifications')
```

já não está a testar um readback service-role. Está a testar uma leitura autenticada como o utilizador administrativo recém autenticado.

A política de RLS da tabela `kyc_verifications` permite leitura do próprio pedido. O admin não é o dono do KYC do cliente. Portanto a query correcta devolve `no_data`, exactamente como observado.

Isto explica todos os sintomas ao mesmo tempo:

```
service-role client
  -> KYC pending visível

signInWithPassword(admin) no mesmo client
  -> sessão admin fica activa em memória

admin.from('kyc_verifications')
  -> pedido passa a usar JWT do admin
  -> RLS não expõe KYC do cliente
  -> maybeSingle() devolve data=null, error=null
  -> retry repete o mesmo erro lógico
```

## 4. Classificação da causa

### Causa: (d) Teste mal escrito

O backend não é o blocker.

A evidência que exclui as outras causas:

(a) RLS: a RLS está a funcionar como configurado. Antes do login, o client service-role vê o pedido KYC. Depois do login, o client administrativo correctamente deixa de ver o pedido de outro utilizador.

(b) Transacção: a RPC `approve_kyc(uuid, boolean, text, uuid)` é exercitada pelos testes SQL nativos com `service_role` e o estado aprovado é usado para obter `is_age_verified() = true`. O job de database está verde.

(c) Race condition: a falha é determinística. Cinco tentativas consecutivas falham, e o padrão repete-se com IDs diferentes. Mais importante, o readback está a ser feito sob a identidade errada, por isso esperar não pode corrigir o problema.

(e) Outro: não há evidência de trigger que elimine ou reverta `kyc_verifications`, nem de overload incorrecto. A assinatura instalada de `approve_kyc` é única.

## 5. Query equivalente com JWT

O equivalente que deve ser reproduzido no teste é exactamente a query A.3.14 usando um client criado com a chave pública e o JWT AAL2 do administrador.

Resultado esperado e contractualmente correcto desse readback autenticado como administrador:

```
data = null
error = null
```

Esse é o comportamento RLS esperado, não uma falha de aprovação.

A prova completa será registada no output do E2E corrigido.

## 6. Correcção

Não alterar `approve_kyc`, RLS, storage ou schema.

A correcção é separar responsabilidades:

1. `admin` permanece exclusivamente como service-role client para operações administrativas e readback de dados de teste.
2. Um segundo client, `adminAuthClient`, usa a chave pública para `signInWithPassword`.
3. O access token obtido continua a ser usado nos POSTs AAL1/AAL2.
4. O readback final continua a usar o client service-role sem sessão de utilizador.

Também será adicionada uma prova explícita no E2E de que o client autenticado como admin não consegue ler o KYC pertencente ao cliente, confirmando que a RLS está a proteger correctamente os dados.

## 7. Estado

Diagnóstico concluído antes da correcção funcional.
Backend não foi alterado como solução definitiva.
A correcção seguinte é exclusivamente no teste E2E.
