# Media Storage

## Arquitectura

A Prively mantém os metadados, autorização, estados de processamento e auditoria no PostgreSQL/Supabase. Os ficheiros originais de media passam a ser armazenados no Backblaze B2 através da API S3-compatible.

O browser nunca recebe credenciais B2. O fluxo é:

`create-media-upload` -> RPC `create_media_upload` -> URL presigned PUT B2 -> upload browser -> `finalize_media_upload` -> jobs de integridade/moderação/derivados -> `get-media-url` -> RPC `get_media_access` -> URL presigned GET B2.

A autorização é avaliada no Supabase antes da assinatura do GET. O RPC `get_media_access` regista o acesso em `media_access_logs`.

## Backends

`MEDIA_BACKEND=supabase` mantém o caminho legado para continuidade operacional.

`MEDIA_BACKEND=b2` usa B2 para novos uploads e leitura dos originais B2.

`MEDIA_BACKEND=both` aceita ambos durante a migração. Novos uploads usam B2; assets antigos continuam a poder ser lidos de Supabase Storage até serem migrados.

## Convenção de chaves

Novos originais:

`users/{user_id}/media/{asset_id}.{ext}`

Exemplos:

`users/6a.../media/4b...jpg`

A extensão deriva do MIME permitido:

| MIME | Extensão |
| --- | --- |
| image/jpeg | jpg |
| image/png | png |
| image/webp | webp |
| image/gif | gif |
| video/mp4 | mp4 |
| video/webm | webm |
| video/quicktime | mov |
| audio/mpeg | mp3 |
| audio/mp4 | m4a |
| audio/wav / audio/x-wav | wav |
| audio/aac | aac |

Chaves antigas permanecem suportadas pelo worker durante a transição.

## Upload

O upload B2 usa `PutObject` presigned por 15 minutos. `Content-Type` é incluído na assinatura e o frontend é obrigado a enviar exactamente o mesmo valor.

O limite de aplicação continua:

- imagem: 50 MB
- vídeo: 100 MB
- áudio: 100 MB

Tipos aceites são os mesmos definidos pelo contrato server-side e pela tabela `media_assets`.

## Download

O endpoint `get-media-url` avalia autenticação e autorização no Supabase primeiro. Só depois disso gera o GET presigned B2 com validade de 60 segundos e `Content-Disposition: inline`.

Assets inexistentes no B2 devolvem 404 com mensagem humana. Indisponibilidade do B2 devolve `b2_unavailable` com retry e ID de correlação.

## Auditoria

Cada autorização de media cria um registo em `media_access_logs` com utilizador, asset, resultado, razão e timestamp. Não são registadas credenciais, URLs presigned nem bytes de media.

## Retenção

A retenção de conformidade não é inventada no código. O valor é lido de `platform_settings.retention_days`. No estado actual esse setting está pendente de configuração jurídica, portanto não existe um número de dias hardcoded neste módulo.

O arquivo de conformidade continua separado do armazenamento de originais e a aplicação da retenção deve seguir a configuração aprovada para produção.

## Migração

O script `scripts/migrate-storage-to-b2.mjs` lê os originais elegíveis de `prively-private`, grava no B2, verifica a cópia e só depois actualiza os metadados para `storage_provider=backblaze_b2`.

O script é idempotente e suporta:

`MEDIA_BACKEND=supabase` para não migrar,

`MEDIA_BACKEND=b2` para migrar e marcar B2,

`MEDIA_BACKEND=both` para executar a migração mantendo leitura dual.

Nunca apagar o objecto Supabase automaticamente durante a migração.
