# Contrato do pipeline de media

O caminho é `create_media_upload` → upload TUS para `prively-private` → `finalize_media_upload` → jobs `integrity`, `moderation`, `archive` e derivados (`thumbnail`, `hls`, `watermark`) → `process-media-job` → `refresh_media_processing_status`. O worker não muda a máquina de estados nem publica o original.

Cada chamada usa `contractVersion: "1"`, `jobId`, `assetId`, `jobType`, URL assinada curta, tipo MIME, tamanho, hash e marca de água. A resposta é `status: "succeeded"` e `output` com paths relativos; paths absolutos, `..` e URLs são rejeitados pelo Edge Function. Falhas devolvem `status: "failed"` e o job fica retido.

O worker próprio vive em `services/media-worker`, com ffmpeg/sharp em contentor. Sem credencial e política aprovada para conteúdo adulto/CSAM, a moderação continua fail-closed e nada é publicado. Testes usam só imagem de cor sólida e vídeos `ffmpeg -f lavfi -i testsrc`.

## Segurança operacional

- Origem privada e URL assinada; o browser nunca recebe o original como fallback.
- HMAC do corpo e token do worker no Vault; logs sem bytes, URLs ou conteúdo.
- Derivados sem EXIF/GPS; a cortina é irreversível, não CSS sobre o original.
- Limites de tamanho/duração, timeout e retenção são de ambiente.
- `reclaim_stale_media_jobs` devolve jobs presos à fila; claim usa `FOR UPDATE SKIP LOCKED`.
