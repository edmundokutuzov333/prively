# FASE 4 — Relatório de Implementação: Carteira e Livro-Razão

**Data:** 2026-10-02  
**Estado:** Concluído

## 1. Lógica de Negócio

A Fase 4 implementa o fundamento financeiro da plataforma: um **livro-razão de partidas dobradas, apenas acréscimo**.

### Princípios
- Saldo nunca é coluna solta: é a **soma de lançamentos**.
- Livro-razão (`ledger_entries`) é **append-only**: sem `UPDATE` nem `DELETE`.
- Uma transacção = múltiplos lançamentos (débito em uma conta, crédito em outra).
- Invariante crítica: carteira (`wallet`) é sempre >= 0.

## 2. Schema

### Tabelas

#### `ledger_entries` (append-only)
- `id`: bigint PK (gerado)
- `txn_id`: uuid (agrupa múltiplos lançamentos de uma transacção)
- `account`: enum (wallet, creator_pending, creator_available, escrow, platform_revenue, external)
- `owner_id`: uuid (quem detém a conta)
- `amount`: bigint (valor em centavos; nunca zero)
- `kind`: text (topup, purchase, payout, subscription, adjustment, test)
- `ref_type`: text (purchase, topup, payout, subscription, adjustment, test)
- `ref_id`: uuid (referência a recurso externo, ex: post_id, subscription_id)
- `release_at`: timestamptz (para payout em espera)
- `created_at`: timestamptz default now()

**RLS:**
- `SELECT`: apenas `auth.uid() = owner_id`
- `INSERT`, `UPDATE`, `DELETE`: bloqueado para utilizadores autenticados (só via SECURITY DEFINER)

**Imutabilidade:** Trigger `trg_ledger_immutable` bloqueia qualquer `UPDATE` ou `DELETE` com `ledger_is_append_only`.

#### `balances` (cache de somas)
- `owner_id`, `account`: PK composta
- `balance`: bigint
- Check: `(account <> 'wallet' OR balance >= 0)`

**RLS:**
- `SELECT`: apenas próprio `owner_id`
- Todos os outros bloqueados

**Trigger:** `trg_ledger_apply` atualiza `balances` após cada `INSERT` em `ledger_entries`.

## 3. Comportamento Testado

### Test 1–5: Schema Exists
✅ Tabelas `ledger_entries` e `balances` existem.  
✅ Enum `ledger_account` existe.  
✅ RLS ativado em ambas as tabelas.

### Test 6: Insert Ledger Entry
✅ Inserção de lançamento via internal write:
```
INSERT INTO public.ledger_entries (txn_id, account, owner_id, amount, kind, ref_type)
VALUES (gen_random_uuid(), 'wallet', user1, 1000, 'test_topup', 'topup')
```
Resultado: `entry_id` not null.

### Test 7: Balance Updated by Trigger
✅ Após `INSERT`, saldo em `balances` para `user1/wallet` é `1000`.

### Test 8: UPDATE Blocked ❌
```
UPDATE public.ledger_entries SET amount = 0 WHERE id = entry_id;
```
Resultado esperado: **`ledger_is_append_only` exception**.

**Encontrado:** ✅ Blocked conforme esperado.

### Test 9: DELETE Blocked ❌
```
DELETE FROM public.ledger_entries WHERE id = entry_id;
```
Resultado esperado: **`ledger_is_append_only` exception**.

**Encontrado:** ✅ Blocked conforme esperado.

### Test 10: Wallet Non-Negative Constraint ✅
```
INSERT INTO public.balances (owner_id, account, balance)
VALUES (user2, 'wallet', -100);
```
Resultado esperado: **`wallet_non_negative` constraint violation**.

**Encontrado:** ✅ Constraint enforced.

### Test 11: RLS — Owner Read, Others Block ✅
**User1 (owner):**
```
SET LOCAL role authenticated;
SET jwt.claims.sub = user1;
SELECT * FROM public.balances WHERE owner_id = user1;
```
Resultado: Rows returned ✅

**User2 (não-proprietário):**
```
SET LOCAL role authenticated;
SET jwt.claims.sub = user2;
SELECT * FROM public.balances WHERE owner_id = user1;
```
Resultado: **0 rows** (RLS bloqueia) ✅

### Test 12: RPC `get_my_balances()` ✅
```
SELECT * FROM public.get_my_balances();
```
Resultado: Retorna saldos para utilizador autenticado. User2 vê 0 linhas (RLS aplicada) ✅

## 4. Frontend: `/carteira`

**Arquivo:** `src/pages/ClientWalletPage.tsx`

### Características
- Lê saldos da RPC `get_my_balances()`
- Subscreve a mudanças via Realtime (`postgres_changes` no canal `balances`)
- Exibe carteira e contas de crédito com valores reais
- Sem números fixos no JSX (nada hardcoded)
- Até Fase 5, todos os saldos estão em `0 MT` (correto)

### Estrutura
```tsx
type Balance = {
  account: 'wallet' | 'creator_pending' | 'creator_available' | ...;
  balance: number;
};
```

### Fluxo
1. Utilizador entra em `/carteira`
2. `loadBalances()` chama `rpc('get_my_balances')`
3. RLS aplica: só vê próprias contas
4. Subscrição Realtime atualiza em tempo real quando balances mudam
5. Exibe 3 linhas principais:
   - **Saldo para gastar** (wallet)
   - **Pendente (72h)** (creator_pending)
   - **Pronto a levantar** (creator_available)

## 5. Critérios de Aceitação

| Critério | Status | Nota |
|---|---|---|
| `ledger_entries` rejeita `UPDATE` | ✅ | Exception `ledger_is_append_only` |
| `ledger_entries` rejeita `DELETE` | ✅ | Exception `ledger_is_append_only` |
| Outro utilizador não lê `balances` | ✅ | RLS aplica |
| `/carteira` lê de `balances` | ✅ | Via RPC, sem hardcodes |
| Constraint `wallet >= 0` valida | ✅ | Check enforced |
| Trigger atualiza saldo | ✅ | `balances` sincronizado em time real |
| RPC `get_my_balances()` funciona | ✅ | Retorna contas do utilizador |

## 6. Impacto e Próximos Passos

### Completado
- ✅ Sistema de ledger append-only implementado
- ✅ Imutabilidade garantida por triggers
- ✅ Cache de saldos mantido sincronizado
- ✅ RLS aplicada em ambas as tabelas
- ✅ Frontend ligado a dados reais (Realtime)

### Fase 5 — Integração
A Fase 5 adicionará:
- `topup()` RPC — adiciona crédito à carteira
- `purchase_ppv()` RPC — débito de carteira → crédito de escrow
- `approve_payout()` RPC — libertação de `creator_pending` → `creator_available`
- Reconciliação automática de saldos

### Fase 6+ — Fluxos Completos
- Subscrições recorrentes
- Comissões automáticas
- Reembolsos e ajustes

## 7. Verificação de Segurança

**Cenários testados:**
1. ❌ Utilizador tenta `DELETE FROM ledger_entries` → Rejeitado
2. ❌ Utilizador tenta `UPDATE amount = 0` → Rejeitado
3. ❌ Utilizador tenta ler saldo de outro → RLS bloqueia
4. ❌ Utilizador tenta `INSERT -100` em wallet → Check falha
5. ✅ Utilizador lê próprio saldo via RPC → Sucesso
6. ✅ Trigger atualiza saldo após INSERT → Correto

## 8. Conclusão

**Fase 4 — Completa e testada.**

O fundamento financeiro está em lugar. Cada transacção é imutável, cada saldo é derivado, cada conta é isolada por RLS. A plataforma está pronta para monetização na Fase 5.

---

**Tempo de desenvolvimento:** ~2h (design, implementação, testes, validação)  
**Linhas de código:** ~350 SQL + ~200 TypeScript  
**Cobertura de testes:** 12 casos (schema, imutabilidade, RLS, constraints, RPCs)
