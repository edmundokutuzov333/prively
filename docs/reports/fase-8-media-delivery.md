# RELATÓRIO — FASE 8

## Funcionalidade concluída

Verificação da entrega segura de media (Cortina), sem recriação dos componentes já certificados.

## Migrações aplicadas

**Nenhuma.** A Fase 8 é explicitamente de verificação. Não foi alterado o contrato das funções certificadas nem foram criadas migrações de produção.

## RLS testada

| Área | Teste | Resultado |
|---|---|---|
| `media_access_logs` | RLS activo em produção | ✓ |
| `media_access_logs` | leitura própria/admin.audit | ✓ |
| `get_media_access` | acesso passa por `can_view_post()` | ✓ |
| `get_media_access` | exige integrity/moderation/scan/processing apropriados | ✓ |

## Edge Functions / RPCs verificadas

| Function | Produção | JWT |
|---|---:|---:|
| `get-media-url` | ACTIVE v39 | obrigatório |
| `create-media-upload` | ACTIVE v13 | obrigatório |
| `get-video-playback-url` | ACTIVE v11 | obrigatório |

`get-media-url` mantém o gate de vídeo B2 com `video_delivery_required`; vídeos B2 não recebem URL directa do B2.
`get-video-playback-url` exige autorização, `storage_provider='backblaze_b2'`, `processing_status='ready'` e `streamtape_status='ready'`/`streamtape_file_id` antes de emitir o embed.

## Rotas / páginas alteradas

**Nenhuma.** O contrato da Fase 8 já existe no frontend e foi verificado sem alteração:
- vídeos utilizam `get-video-playback-url`;
- outros media utilizam `get-media-url`;
- o frontend não depende de CSS blur para a Cortina.

## Testes correram

### Verificação transaccional real no Supabase

Executada em produção dentro de `BEGIN ... ROLLBACK` com fixtures temporárias:
- proprietário → acesso: `true` ✓
- conteúdo `public` → `true` ✓
- `followers` com follow → `true` ✓;
- `followers` sem follow → `false` ✓;
- `ppv` com compra → `true` ✓;
- `ppv` sem compra → `false` ✓.

Nenhum fixture ficou persistido.

### Evidência actual dos media

Snapshot do Supabase:
- 7 assets históricos no total, todos vídeos e com `storage_provider='backblaze_b2'`;
- 4 estavam `streamtape_status='ready'` e 3 `not_started` no conjunto histórico;
- no filtro actual `deleted_at is null`, existe 1 asset, marcado `channel_is_seed=true`, em `draft`, com Streamtape ready;
- esse asset actual não tem `thumb_blur_path`, `hls_path` ou `watermark_path` preenchidos.

A arquitectura do worker, porém, gera a miniatura server-side através de Sharp e grava o resultado em `thumb_blur_path`; não há implementação de Cortina baseada em CSS blur.

### Suite automatizada adicionada

`supabase/tests/database/phase8_media_delivery_verification_test.sql` — 23 assertions.
Foi adicionada ao suite nativo de CI.

O workflow CI desta versão ainda não foi observado como concluído/verde.

## Critérios de aceitação

- [✗] `MEDIA_BACKEND=b2` confirmado directamente nos Secrets — **UNVERIFIED**. A evidência de produção é indirecta mas consistente: o asset existente declara `storage_provider='backblaze_b2'`, `metadata.media_backend='b2'` e o bucket `prively-media-originals-2026`. A ferramenta Supabase disponível nesta sessão não expõe `supabase secrets list`.
- [✗] CORS do bucket B2 confirmado no painel/API — **UNVERIFIED**. O repositório contém a configuração esperada para `https://prively.vercel.app` e `http://localhost:5173`, mas a sessão não tem acesso verificável ao painel/API administrativo do Backblaze.
- [✓] `get-media-url`, `create-media-upload`, `get-video-playback-url` estão ACTIVE e nas versões exigidas (39, 13 e 11).
- [✓] `can_view_post` testado para proprietário, `public`, `followers` e `ppv`.
- [✓] `can_view_post` também cobre `subscribers` e `tier`, além dos gates de processamento, KYC, blocks/hidden e Streamtape.
- [✓] A miniatura desfocada é concebida como ficheiro derivado no worker (`thumb_blur_path`), não como CSS blur.
- [✗] Transição de um vídeo novo `not_started → processing → completed` em staging — **UNVERIFIED**. Não existe actualmente projecto Supabase de staging disponível e não foi criado um staging artificialmente para mascarar este bloqueador.

## Bugs conhecidos / UNVERIFIED

- CORS B2 externo: UNVERIFIED.
- Secret `MEDIA_BACKEND`: valor directo dos Secrets UNVERIFIED; evidência efectiva em asset aponta para `b2`.
- E2E real de um novo vídeo em staging: UNVERIFIED por ausência de staging.
- O único media asset não apagado actualmente é seed/draft e não tem derivados de Cortina preenchidos; não foi usado como prova de publicação real.
- CI completo ainda não certificado nesta execução.
- Vercel e blockers transversais 0.6/0.7 continuam fora desta fase.

## Auditoria

- Não foram alterados `get-media-url`, `create-media-upload` ou `get-video-playback-url`.
- Não foi criada nenhuma credencial, fixture externa ou URL de media fictícia para declarar sucesso.
- `reconcile_ledger() = 0` após as verificações.

## docs/STATE.md actualizado

sim.

## Pronto para a Fase 9

**não.**

A lógica de entrega segura e autorização está verificada, mas a certificação formal da Fase 8 permanece bloqueada por três evidências externas que ainda não são verificáveis nesta sessão: Secrets do Supabase, CORS real do bucket B2 e a transição end-to-end de um novo vídeo em staging.