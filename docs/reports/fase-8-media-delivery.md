# RELATÓRIO — FASE 8

## Funcionalidade concluída

Verificação e hardening fail-closed da entrega segura de media (Cortina), sem recriação de `get-media-url`, `create-media-upload` ou `get-video-playback-url`.

## Migrações aplicadas

1. `20261001170000_phase8_media_derivative_readiness_fix`
   - corrige o fast-path que podia marcar vídeos como `ready` antes dos derivados;
   - exige thumbnail server-side, watermark quando activo, HLS para vídeo e Streamtape `ready` quando o original está em B2;
   - endurece `get_media_access()` para não entregar media incompleta a utilizadores não-owner/admin;
   - mantém funções com `SECURITY DEFINER`, `search_path=public, pg_temp` e grants restritos.

A migração foi aplicada no Supabase de produção.

## RLS testada

| Área | Teste | Resultado |
|---|---|---|
| `media_assets` | RLS activo em produção | ✓ |
| `media_access_logs` | RLS activo em produção | ✓ |
| `media_access_logs` | função de acesso regista decisões | ✓ |
| `refresh_media_processing_status` | authenticated não executa | ✓ |
| `refresh_media_processing_status` | apenas service_role executa | ✓ |

Não foi criada nenhuma tabela nova nesta fase.

## Edge Functions / RPCs verificadas

| Function | Produção | JWT |
|---|---:|---:|
| `get-media-url` | ACTIVE v39 | obrigatório |
| `create-media-upload` | ACTIVE v13 | obrigatório |
| `get-video-playback-url` | ACTIVE v11 | obrigatório |

As três funções certificadas não foram alteradas.

`get-media-url` continua a distinguir erros B2 e mantém a entrega de vídeo separada.
`get-video-playback-url` exige vídeo B2, processamento pronto e Streamtape pronto antes do embed.

## Rotas / páginas alteradas

Nenhuma. A Fase 8 continua uma verificação/hardening de backend e media pipeline; não foi necessário alterar a UI.

A arquitectura actual usa `thumb_blur_path` como derivado server-side. O worker usa Sharp para gerar o preview desfocado; não existe Cortina dependente de CSS blur.

## Testes correram

### Verificação real em produção

Foi observado o único asset de vídeo activo existente:

- `storage_provider=backblaze_b2`
- `streamtape_status=ready`
- `processing_status=ready` antes da correcção
- `thumb_blur_path=null`
- `watermark_path=null`
- `hls_path=null`

Após aplicar a migração, `refresh_media_processing_status()` mudou esse asset de `ready` para `failed`, porque o processamento anterior tinha um job bloqueado por `processor_not_configured`. Esta mudança é fail-closed e evita entregar um asset que não possui os derivados necessários.

Snapshot posterior:
- media activos: 1
- vídeos activos: 1
- vídeos activos `ready`: 0
- thumbnails derivadas activas: 0
- watermarks derivadas activas: 0
- vídeo activo em Streamtape `ready`: 1
- `reconcile_ledger()=0`

### Suite automatizada

Existente no repositório:
- `supabase/tests/database/phase8_media_delivery_verification_test.sql` — 23 assertions, já coberta pelo CI.

Adicionada nesta execução:
- `supabase/tests/database/phase8_media_security_test.sql` — 21 assertions, focada no contrato fail-closed de derivados, `get_media_access`, RLS e visibilidade public/followers/PPV/owner.

A nova suite foi adicionada ao workflow nativo do CI.

O `supabase test db` / CI completo desta execução não foi observado como verde. A sessão de produção também não disponibiliza pgTAP como função SQL para executar estas suites directamente no projecto remoto.

## Critérios de aceitação

- [✗] `MEDIA_BACKEND=b2` confirmado directamente via Secrets — **UNVERIFIED**. O runtime efectivo observado usa `storage_provider='backblaze_b2'` e metadata `media_backend='b2'`, mas a ferramenta disponível não expõe `supabase secrets list`.
- [✗] CORS B2 confirmado no painel/API Backblaze — **UNVERIFIED**. `docs/b2-cors.md` contém a configuração normativa, mas não existe acesso verificável ao painel/API administrativo do bucket nesta sessão.
- [✓] `get-media-url`, `create-media-upload`, `get-video-playback-url` ACTIVE nas versões 39, 13 e 11.
- [✓] `can_view_post()` mantém regras para owner, public, followers, subscribers, tier e PPV; as regras estão presentes na definição remota.
- [✓] Derivado de thumbnail é modelado como ficheiro server-side (`thumb_blur_path`), e o worker de media usa Sharp para gerar o resultado.
- [✗] Um vídeo novo `not_started → processing → completed` em staging — **UNVERIFIED**. O projecto Supabase disponível é apenas o de produção; não existe staging para executar o fluxo end-to-end exigido.
- [✓] Media incompleta deixou de poder ser marcada/entregue como `ready` através do contrato de readiness corrigido.

## Bugs conhecidos / UNVERIFIED

- Secret `MEDIA_BACKEND`: UNVERIFIED por falta de acesso directo à lista de secrets.
- CORS B2: UNVERIFIED externamente.
- Processor externo de media: o asset activo tem job `thumbnail`/`watermark` bloqueado com `processor_not_configured`; não há endpoint de processor activo verificado nesta execução.
- Staging/Streamtape E2E de vídeo novo: UNVERIFIED por ausência de projecto Supabase de staging.
- CI completo: não certificado nesta execução.
- Vercel e blockers transversais 0.6/0.7 continuam fora desta fase.

## Auditoria

- `get-media-url`, `create-media-upload` e `get-video-playback-url` não foram modificados.
- Não foram criados dados fictícios persistentes.
- O único asset activo continua bloqueado/failed em vez de ser promovido artificialmente a ready.
- `reconcile_ledger()=0`.
- ADR-012 registado em `docs/decisions.md`.

## docs/STATE.md actualizado

sim.

## Pronto para a Fase 9

**não.**

A entrega segura foi hardened e agora falha fechada quando faltam derivados ou Streamtape. A certificação formal da Fase 8 continua bloqueada por evidências externas não verificáveis nesta sessão e pela inexistência de staging/processor configurado para demonstrar um novo vídeo end-to-end.
