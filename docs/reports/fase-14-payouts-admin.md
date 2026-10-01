# RELATÓRIO — FASE 14

Funcionalidade concluída: Levantamentos, ganhos e admin essencial.

## Migrações aplicadas

- `20261001150929_phase14_payouts_earnings_admin_contract`
  - adiciona `get_creator_earnings_summary()`;
  - adiciona `get_admin_storage_status()`;
  - mantém DML directo de `authenticated` em `payouts` revogado.
- `20261001151226_phase14_admin_storage_runtime_fix`
  - corrige a volatilidade de `get_admin_storage_status()` para `VOLATILE`, porque o RPC grava auditoria através de `phase8_audit()`.

A tabela `payouts` e o motor financeiro não foram recriados. O runtime existente já tinha a implementação mais completa que a versão inicial da Fase 14:
- `request_payout(bigint,text,jsonb,text)`;
- idempotência por `idempotency_key`;
- `FOR UPDATE` sobre `creator_available`;
- KYC aprovado;
- termos actuais da criadora;
- MFA financeiro AAL2 recente;
- hold em `creator_available` + `escrow`;
- auditoria em `financial_audit_log`.

## RLS e privilégios testados

Em produção:

- `payouts`: INSERT directo por `authenticated` = false.
- `payouts`: UPDATE directo por `authenticated` = false.
- `payouts`: DELETE directo por `authenticated` = false.
- `audit_log`: UPDATE directo por `authenticated` = false.
- `audit_log`: DELETE directo por `authenticated` = false.
- `audit_log` tem trigger de imutabilidade.
- `backup_runs` existe com RLS activo.

## RPCs

Produção confirma:

- `request_payout`: EXECUTE para authenticated.
- `get_creator_earnings_summary`: EXECUTE para authenticated.
- `get_admin_storage_status`: EXECUTE para authenticated, com controlo server-side de papel admin + AAL2.

## Frontend

### `/estudio/ganhos`

A página passa a obter também:

- ganhos acumulados reais a partir de `ledger_entries`;
- levantamentos pedidos reais a partir de `payouts`;
- saldo pendente;
- saldo disponível.

Nada é calculado a partir de valores fixos no JSX.

### `/admin/storage`

Nova superfície administrativa:

- Backblaze B2;
- Streamtape;
- backups;
- estado operacional e refresh;
- estados vazio, loading e erro.

A rota está protegida por `AdminGuard`, que já exige papel admin, factor MFA TOTP verificado e AAL2 quando a sessão exige step-up.

## Estado real de produção

Leitura directa da base:

- media assets B2 activos: 1;
- tamanho registado desses assets: 2092 bytes;
- falhas Streamtape com mais de 1 hora: 0;
- `backup_runs`: 0;
- último backup confirmado: inexistente.

A UI apresenta estes estados como dados reais. Não apresenta um backup fictício nem inventa a capacidade externa do bucket B2.

## Testes

Suite criada:

`supabase/tests/database/phase14_payouts_admin_test.sql`

Cobertura:
- existência/RLS de payouts;
- bloqueio de DML directo;
- grants dos RPCs;
- imutabilidade de audit_log;
- `FOR UPDATE` no request_payout;
- idempotência;
- criação do payout hold;
- redução do saldo disponível;
- bloqueio de segundo levantamento acima do saldo.

Workflow criado:

`.github/workflows/phase14-finance-admin.yml`

A execução GitHub Actions desta sessão não ficou observável através do conector disponível. Portanto CI não é marcado como verde.

A tentativa de executar o cenário financeiro transaccional directamente na produção foi bloqueada pelo filtro de segurança do conector para operações financeiras combinadas. Não será apresentado como teste executado.

## Critérios de aceitação

- [✓] `request_payout` usa hold em `creator_available` e `escrow`.
- [✓] Concorrência é protegida por `FOR UPDATE` no saldo do criador e idempotência por `idempotency_key`.
- [✓] `audit_log` não aceita UPDATE/DELETE por authenticated e possui trigger append-only.
- [✓] `/admin` permanece protegido por AdminGuard + MFA.
- [✓] `/admin/storage` existe e apresenta dados reais de B2, Streamtape e backups.
- [✓] `/estudio/ganhos` apresenta agregações reais do ledger e levantamentos.
- [ ] CI/pgTAP verde: não observado nesta sessão.
- [ ] Restore drill operacional: continua bloqueado pelo gate 0.7, sem staging confirmado.

## Bugs conhecidos / UNVERIFIED

- CI da Fase 14 não observado.
- Não existe backup confirmado em `backup_runs`.
- O cron `prively-backup-db` não foi observado no `pg_cron` do projecto de produção.
- Restore drill continua pendente por falta de projecto Supabase de staging.
- O tamanho B2 apresentado pela nova página é o tamanho registado em `media_assets.file_size_bytes`, não uma consulta ao bucket B2.

## docs/STATE.md actualizado

sim.

## Pronto para a Fase 15

não aplicável nesta versão do plano, que termina na Fase 14.

Os gates transversais 0.6, 0.7, Vercel e certificação final da Fase 8 continuam a existir e não foram marcados como resolvidos.
