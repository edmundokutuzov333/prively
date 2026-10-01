# RELATÓRIO — FASE 13

Funcionalidade concluída: Denúncias, moderação e botão de pânico.

## Migrações aplicadas

1. `20261001150231_phase13_safety_runtime_contract`
   - reutiliza o modelo de segurança da Fase 8;
   - endurece `create_panic_event(boolean,uuid)` com validação de utilizador e localização;
   - remove DML directo de `authenticated` em `reports` e `panic_events`;
   - mantém escrita através de RPCs server-side.

Nota: `reports`, `panic_events`, `trusted_contacts` e `audit_log` já existiam em produção desde a Fase 8. A Fase 13 não os duplicou.

## RLS testada

- `public.reports`: RLS activa; INSERT/UPDATE/DELETE directos para `authenticated` bloqueados.
- `public.panic_events`: RLS activa; INSERT/DELETE directos para `authenticated` bloqueados.
- A gravação continua nos RPCs `submit_report()` e `create_panic_event()`.
- `audit_log` permanece append-only e só foi usado server-side.

## Edge Functions

- `trigger-panic`: ACTIVE v1, `verify_jwt=true`.
- O fluxo chama `create_panic_event()` e, de seguida, `safety-alert-dispatch`.
- `safety-alert-dispatch` já existente continua responsável por notificar suporte e pelo adapter externo HMAC/SMS quando configurado.
- A entrega SMS externa continua UNVERIFIED/NOT_CONFIGURED quando o provider não está configurado. Não foi fabricada qualquer confirmação de SMS.

## Rotas e UI

- `CreatorPanicButton` criado em `src/features/safety/CreatorPanicButton.tsx`.
- Montado no `WorkspaceLayout` de criadora, ficando persistente em `/estudio` e subrotas.
- `/estudio/panico` existente continua disponível como superfície detalhada de segurança.
- Estado do botão: idle, busy, success e error.
- i18n adicionado em pt-MZ, en e fr.
- A superfície existente de denúncias continua a usar `submit_report()` e mostra confirmação ao utilizador.

## Testes correram

### Prova transaccional real em Supabase

Executada no projecto de produção com utilizadores temporários e rollback:

- submit_report() criou uma denúncia real dentro da transacção;
- `audit_log` registou 1 evento `report_created`;
- create_panic_event() criou 1 incidente;
- `audit_log` registou 1 evento `panic_event_created`;
- DML directo autenticado em reports/panic_events ficou bloqueado;
- grants dos RPCs ficaram confirmados;
- rollback deixou 0 utilizadores, 0 perfis, 0 denúncias e 0 panic_events dos fixtures.

### pgTAP

Suite versionada em `supabase/tests/database/phase13_safety_test.sql` com 16 assertions.

A tentativa de executar pgTAP directamente no projecto Supabase de produção não foi possível porque a extensão `pgTAP` não está instalada nesse ambiente. O workflow CI dedicado executa a suite sobre uma base local reconstruída a partir das migrações.

### CI

Workflow dedicado:
`.github/workflows/phase13-safety.yml`

O estado de execução do GitHub Actions da main não ficou observável através das interfaces/conectores disponíveis nesta sessão. Portanto, CI verde não é declarado.

## Critérios de aceitação

- [✓] `trigger-panic` persiste o incidente e chama o dispatcher de alertas através de um contrato JWT autenticado. A invocação live da Edge Function não foi executada para não gerar efeitos laterais em utilizadores reais.
- [✓] Denúncia gera `audit_log` real: confirmado na prova transaccional de produção.
- [✓] Botão de pânico persistente em `/estudio`: componente montado no `WorkspaceLayout` de criadora.

## Bugs conhecidos / UNVERIFIED

- CI GitHub da Fase 13: execução não observável nesta sessão.
- pgTAP em produção: não executado, porque a extensão não existe no projecto de produção.
- SMS/contactos externos de emergência: dependem de provider externo configurado; estado permanece não configurado/unverified.
- Não foram criados dados persistentes de demonstração.

## docs/STATE.md actualizado

sim.

## Pronto para a Fase 14

sim do ponto de vista funcional da Fase 13.

Não significa que os gates transversais estejam fechados. 0.6, 0.7, Vercel e a certificação final da Fase 8 continuam pendentes e devem permanecer visíveis no estado global da plataforma.
