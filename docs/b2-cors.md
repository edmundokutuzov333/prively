# Backblaze B2 CORS

Bucket: `prively-media-originals-2026`

O frontend usa URLs presigned do endpoint S3-compatible do Backblaze. A política deve permitir apenas as duas origens previstas e os headers necessários ao browser.

## Regra B2 Native exacta

Aplicar no painel do Backblaze B2:

```json
[
  {
    "corsRuleName": "prively-web",
    "allowedOrigins": [
      "https://prively.vercel.app",
      "http://localhost:5173"
    ],
    "allowedHeaders": [
      "*"
    ],
    "allowedOperations": [
      "b2_upload_file",
      "b2_download_file_by_name"
    ],
    "exposeHeaders": [],
    "maxAgeSeconds": 86400
  }
]
```

## Equivalente S3-compatible

Como os presigned URLs da Prively são emitidos pelo endpoint S3-compatible, a configuração S3 equivalente a aplicar no bucket, caso o painel esteja a apresentar regras CORS da API S3, é:

```json
[
  {
    "AllowedOrigins": [
      "https://prively.vercel.app",
      "http://localhost:5173"
    ],
    "AllowedMethods": [
      "PUT",
      "GET"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 86400
  }
]
```

Não adicionar `*` a `AllowedOrigins`. O bucket deve continuar privado.

## Verificação

O teste de integração deve enviar um preflight com:

- `Origin: http://localhost:5173`
- `Access-Control-Request-Method: PUT`
- `Access-Control-Request-Headers: content-type`

A resposta deve ser 2xx e incluir `Access-Control-Allow-Origin: http://localhost:5173`.
