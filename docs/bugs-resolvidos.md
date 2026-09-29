# Bugs Resolvidos

## 2026-09-29

### AUD-001
**Problema:** o harness native SQL executava suites pgTAP sem carregar a extensão.  
**Causa:** `psql` directo com `search_path` incompatível.  
**Correcção:** criar extensão pgtap e normalizar `PGOPTIONS`.  
**Teste:** suites native passam a ter acesso a `plan()`, `ok()`, `finish()`.  
**Commit:** `3ad01c1b6b4a58a159bcb3c5c1aa138d2d0c737d`.

### AUD-002
**Problema:** Creator Terms falhava em meeting commission.  
**Causa:** comparação de strings `0` vs `0.00`.  
**Correcção:** comparação numeric.  
**Teste:** `0.20`, `0.10` e `0` numéricos.  
**Commit:** `3ad01c1b6b4a58a159bcb3c5c1aa138d2d0c737d`.

### AUD-003
**Problema:** suite media recebia `creator_verification_required`.  
**Causa:** fixture persistia versão `1.0` quando o contrato era `1.0.0`.  
**Correcção:** fixture alinhada com a versão contratual.  
**Teste:** caminho de criação de creator/media preparado para a versão actual.  
**Commit:** `3ad01c1b6b4a58a159bcb3c5c1aa138d2d0c737d`.

### AUD-004
**Problema:** Phase 5 hardening planeava 16 testes e executava 17.  
**Causa:** plan TAP desactualizado.  
**Correcção:** `plan(17)`.  
**Commit:** `3ad01c1b6b4a58a159bcb3c5c1aa138d2d0c737d`.

### AUD-005
**Problema:** Phase 7 reportava duas falhas.  
**Causa:** teste procurava alias inexistente e o rebuild local não materializava `last_heartbeat_at`.  
**Correcção:** teste alinhado com a política real e migração forward-only do campo.  
**Commit:** `3ad01c1b6b4a58a159bcb3c5c1aa138d2d0c737d`.

### AUD-006
**Problema:** `send_message_v2_core` tinha referência ambígua.  
**Causa:** `message_id=message_id` em PL/pgSQL.  
**Correcção:** variável `v_message_id` e alias de tabela.  
**Commit:** `3ad01c1b6b4a58a159bcb3c5c1aa138d2d0c737d`.

### AUD-007
**Problema:** várias `SECURITY DEFINER` estavam com `search_path=public`.  
**Causa:** hardening incompleto.  
**Correcção:** nova migração que fixa `public, pg_temp` e cria políticas fail-closed onde necessário.  
**Commit:** `3ad01c1b6b4a58a159bcb3c5c1aa138d2d0c737d`.  
**Nota:** validado em `BEGIN/ROLLBACK`, não aplicado remotamente.

### AUD-008
**Problema:** compliance podia avaliar `phase8_can_compliance_read` sem AAL2.  
**Causa:** função verificava papel mas não nível AAL.  
**Correcção:** AAL2 obrigatório no servidor.  
**Commit:** `8be12a004ad8d1597f380c3cd454edef3e0583f8`.  
**Nota:** validado em transacção rollback.

### AUD-009
**Problema:** Playwright corria sem configuração Supabase.  
**Causa:** o job E2E não exportava as variáveis Vite exigidas no bootstrap.  
**Correcção:** URL + publishable key no job E2E.  
**Commit:** `3ad01c1b6b4a58a159bcb3c5c1aa138d2d0c737d`.  
**Nota:** nova execução ainda pendente.

### AUD-010
**Problema:** novas suites de segurança não estavam incluídas no array do harness CI.  
**Causa:** suites adicionadas depois do conjunto original.  
**Correcção:** inclusão em `.github/workflows/ci.yml`.  
**Commit:** `9a02f7befef75c205be6366a94a620133e364273`.
