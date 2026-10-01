# FASE 4 — Relatório de Reconciliação e Implementação Final

**Data:** 2026-10-02  
**Status:** Concluído — Forward-only, Idempotente, Integrado

## 1. Problemas Corrigidos

### Problema 1: Trigger de Bloqueio Conflituoso
**Antes:**
```sql
CREATE TRIGGER trg_ledger_blocked
  BEFORE INSERT ON public.ledger_entries
  WHEN (auth.uid() IS NOT NULL)
  EXECUTE FUNCTION public.ledger_insert_blocked();
```

**Problema:** `SECURITY DEFINER` altera permissões, mas não elimina `auth.uid()`. Assim, funções financeiras internas que fazem `INSERT` recebiam erro `ledger_append_restricted`.

**Solução:**
- Removido trigger baseado em `auth.uid()`.
- RLS agora restringe: `authenticated` pode `INSERT` com `WITH CHECK (false)`.
- `service_role` permite (usado por funções `SECURITY DEFINER`).
- Função interna `private.ledger_append()` executa com grant apenas a `service_role`.

### Problema 2: Objetos Duplicados
**Antes:** Migration criava `ledger_entries`, `balances`, `ledger_account` sem `IF NOT EXISTS` ou detecção.

**Solução:** Migration 20261002110000 usa `DO $$ ... IF NOT EXISTS ... END $$` para cada objeto, permitindo re-runs idempotentes.

### Problema 3: Falta de Validação de Partidas Dobradas
**Antes:** Sem controle de que `txn_id` sempre tem `sum(amount) = 0`.

**Soluão:** Trigger `trg_assert_ledger_balanced` (DEFERRABLE INITIALLY DEFERRED) valida:
- Cada transacção tem >= 2 lançamentos.
- Soma de `amount` = 0 (débito = crédito).

### Problema 4: Frontend Ligado Incorretamente
**Antes:** `src/pages/ClientWalletPage.tsx` criada, mas rota `/carteira` usava `ExperiencePages.ClientWalletPage()` (placeholder vazio).

**Soluão:** Substituir import e export em `ExperiencePages.tsx` para usar a versão real ligada a `get_my_balances()` + Realtime.

## 2. Arquitetura Final

### Schema

#### `ledger_entries` (append-only)
```sql
CREATE TABLE public.ledger_entries (
  id bigint PRIMARY KEY,
  txn_id uuid NOT NULL,  -- Agrupa partidas da mesma transacção
  account ledger_account NOT NULL,  -- Tipo de conta
  owner_id uuid NOT NULL,
  amount bigint NOT NULL,  -- Nunca zero
  kind text NOT NULL,  -- topup, purchase, payout, subscription, etc.
  ref_type text,  -- Tipo de referência externa
  ref_id uuid,  -- ID do recurso (post_id, subscription_id, etc.)
  metadata jsonb,  -- Contexto adicional (channel_id, etc.)
  release_at timestamptz,  -- Para payout em espera
  created_at timestamptz
);
```

**Imutabilidade:**
- Trigger `trg_ledger_no_upd` bloqueia `UPDATE` e `DELETE` com `ledger_is_append_only`.
- RLS: `authenticated` só lê (`SELECT`), sem `INSERT/UPDATE/DELETE`.
- `service_role` pode `INSERT` (via funções `SECURITY DEFINER`).

#### `balances` (cache)
```sql
CREATE TABLE public.balances (
  owner_id uuid NOT NULL,
  account ledger_account NOT NULL,
  balance bigint NOT NULL,
  PRIMARY KEY (owner_id, account),
  CHECK (account <> 'wallet' OR balance >= 0)
);
```

**Manutenção:** Trigger `trg_ledger_apply` atualiza `balances` após cada `INSERT` em `ledger_entries`.

### Camada Financeira Interna

```plpgsql
CREATE FUNCTION private.ledger_append(
  _txn_id uuid,
  _account ledger_account,
  _owner_id uuid,
  _amount bigint,
  _kind text,
  _ref_type text,
  _ref_id uuid,
  _release_at timestamptz,
  _metadata jsonb
) RETURNS bigint
SECURITY DEFINER
```

- Grant: Apenas `service_role` (acesso interno).
- Rejeitado por `authenticated`.
- Usado por: `topup()`, `purchase_ppv()`, `subscribe()`, `request_payout()`, etc.

### API Pública

```plpgsql
CREATE FUNCTION public.get_my_balances()
RETURNS TABLE (account ledger_account, balance bigint)
SECURITY DEFINER
```

- Lé `balances` filtrado por `auth.uid()`.
- RLS aplicada: retorna 0 linhas para outro utilizador.
- Executada por: `authenticated`.

## 3. Testes Executados

| # | Teste | Esperado | Resultado |
|---|---|---|---|
| 1 | Schema: `ledger_entries` existe | Sim | ✅ Passou |
| 2 | Schema: `balances` existe | Sim | ✅ Passou |
| 3 | Schema: `ledger_account` enum | Sim | ✅ Passou |
| 4 | RLS: `ledger_entries` | Ativo | ✅ Passou |
| 5 | RLS: `balances` | Ativo | ✅ Passou |
| 6 | Imutabilidade: `UPDATE` bloqueado | Exception `ledger_is_append_only` | ✅ Passou |
| 7 | Imutabilidade: `DELETE` bloqueado | Exception `ledger_is_append_only` | ✅ Passou |
| 8 | Trigger: Saldo atualizado | `1000 MT` após INSERT | ✅ Passou |
| 9 | Constraint: Carteira >= 0 | Recusa INSERT `-500` | ✅ Passou |
| 10 | RLS: User2 não lê User1 | 0 rows | ✅ Passou |
| 11 | RLS: User1 lê próprio | > 0 rows | ✅ Passou |
| 12 | RPC: `get_my_balances()` | Retorna data | ✅ Passou |
| 13 | Partidas dobradas: `sum(amount)=0` | 2 entries, sum 0 | ✅ Passou |
| 14 | Admin: `reconcile_balances()` | Recalcula saldos | ✅ Passou |

## 4. Integração do Frontend

### Rota: `/carteira`

**Antes:**
```tsx
// ExperiencePages.tsx
export function ClientWalletPage() {
  return <PageFrame ... detail={t('experience.pages.wallet.detail')} />
  // Placeholder vazio
}
```

**Depois:**
```tsx
// ClientWalletPage.tsx
export function ClientWalletPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const sb = requireSupabase();
  
  // Carrega via RPC
  const { data } = await sb.rpc('get_my_balances');
  
  // Subscreve a mudanças
  sb.channel(`balances_${user.id}`)
    .on('postgres_changes', { table: 'balances' }, ...)
    .subscribe();
  
  return (
    <Ficha>
      <h1>{formatMznFromCents(walletBalance)}</h1>
      <div>{balances.map(...)}</div>
    </Ficha>
  )
}
```

### Dados Reais

- ✅ Nenhum valor hardcoded (sem `0 MT` constante).
- ✅ Leitura de `balances` via RPC.
- ✅ Realtime: mudanças aparecem em tempo real quando ledger é atualizado.
- ✅ Sem mock de dados de demonstração.

## 5. Critérios de Aceitação

| Critério | Status | Nota |
|---|---|---|
| `ledger_entries` append-only | ✅ | Trigger + RLS |
| `UPDATE` bloqueado | ✅ | Exception `ledger_is_append_only` |
| `DELETE` bloqueado | ✅ | Exception `ledger_is_append_only` |
| `balances` inacessível (outro user) | ✅ | RLS aplica |
| `/carteira` real (não placeholder) | ✅ | Ligada a `get_my_balances()` + Realtime |
| Constraint `wallet >= 0` | ✅ | Check enforced |
| Partidas dobradas validadas | ✅ | Trigger `assert_ledger_txn_balanced` |
| Migration forward-only | ✅ | `DO $$ IF NOT EXISTS ... END $$` |
| Grants: `service_role` only | ✅ | `private.ledger_append()` |
| RPC `get_my_balances()` | ✅ | Executada por `authenticated` |

## 6. Próximos Passos

### Fase 5 — Operações Financeiras

- `topup_wallet()` — Adiciona crédito (`wallet` += X, `platform_revenue` += X, txn_id balanceado)
- `purchase_ppv()` — Compra conteúdo (`wallet` -= X, `escrow` += X)
- `pay_creator()` — Liberta ganhos (`creator_pending` → `creator_available`)

### Fase 6 — Integrações

- `approve_payout()` — Liberta fundo (`creator_available` → `external` via processador de pagamentos)
- Reconciliação automática (job crónico)
- Auditorias financeiras

## 7. Validação de Segurança

❌ **Tentativas Bloqueadas:**
1. `UPDATE ledger_entries SET amount=0` → `ledger_is_append_only`
2. `DELETE FROM ledger_entries` → `ledger_is_append_only`
3. Utilizador tenta `INSERT` direto → RLS bloqueia
4. Utilizador lê `balances` de outro → RLS bloqueia (0 rows)
5. `INSERT -100` em wallet → Constraint falha
6. Transacção desbalanceada (`sum(amount) <> 0`) → Trigger bloqueia

✅ **Operações Permitidas:**
1. Utilizador lê próprio saldo via RPC
2. Função `SECURITY DEFINER` insere partidas balanceadas
3. Admin reconcilia saldos
4. Realtime distribui mudanças

## 8. Conclusão

**Fase 4 — Concluída com sucesso.**

O fundamento financeiro está blindado:
- ✅ Ledger append-only garantido por imutabilidade.
- ✅ Saldos sempre corretos (derivados de partidas, não coluna solta).
- ✅ RLS protege dados de outros utilizadores.
- ✅ Partidas dobradas validadas (débito = crédito).
- ✅ Frontend ligado a dados reais.
- ✅ Migration forward-only e idempotente.

A plataforma está pronta para monetização na Fase 5.

---

**Tempo de desenvolvimento:** ~3h (análise, correção, testes, validação, frontend)  
**Arquivos:** 3 (1 migration, 1 test suite, 1 component frontend)  
**Cobertura:** 14 testes, 100% passa
