# RELATÓRIO FASE 3 — Conteúdo e media reais

## 1. Resumo executivo (máx. 8 linhas, linguagem simples, sem jargão)

O processamento de media ganhou um contrato assinado entre a fila e o worker.
O dispatcher reclama trabalhos de forma segura e recupera trabalhos parados.
O worker valida tamanho, tipo, assinatura e contrato antes de processar.
A prévia bloqueada é irreversível: reduz, desfoca e re-encoda a imagem sem metadados EXIF.
O job existente continua a controlar scan, moderação, publicação e URLs assinados.
O worker tem Dockerfile, lockfile e teste próprio aprovado.
A ligação final ao storage derivado e ao fornecedor de scan ainda depende de ambiente de staging.

## 2. Commits e tag

- `650cb5f` — `fase-3: media: add signed dispatch and worker contract`
- Tag local: `fase-3-concluida`
- Publicação remota: pendente de atualização autenticada da `main`; não foi usado force push.

## 3. Evidências (colar output REAL, truncado se enorme)

- `npm test` em `services/media-worker` — 1 teste aprovado, 0 falhas.
- `npm audit --omit=dev --audit-level=high` no worker — `found 0 vulnerabilities` após atualizar Sharp para 0.35.5.
- `npm run typecheck` — passou no frontend.
- `npm run lint` — 0 erros; 1 aviso pré-existente.
- `npm run check:migrations` — `OK: 167 migrações, sem versões duplicadas`.
- `npm run audit:production` — `76 browser files and 35 Edge Function files inspected`.
- `npm run build` — concluído e service worker PWA gerado.
- `supabase db reset` / `supabase test db` — não executados neste ambiente; não há evidência de aplicação da migração no projecto remoto.
- Playwright / k6 — não executados nesta fase.

## 4. Critérios de aceitação da fase — cada um ✅ / ❌ / ⚠️ com a evidência

- ✅ Dispatcher com token de job, `FOR UPDATE SKIP LOCKED`, reclaim de trabalhos antigos e chamada apenas ao worker autorizado.
- ✅ Worker com contrato versionado, HMAC, limite de bytes e validação de URL HTTPS.
- ✅ Preview irreversível testada; sem EXIF e com dimensões controladas.
- ✅ Caminho normal existente mantém scan/moderação antes de publicação e URL de curta duração.
- ⚠️ Upload final dos derivados para storage privado não está ligado no worker; o serviço devolve o caminho derivado, mas não finge que o publicou.
- ⚠️ Scan externo/staging e E2E com ficheiro real não foram executados.
- ⚠️ Migração ainda não foi aplicada ao Supabase remoto nesta execução.

## 5. Estado da plataforma (scoreboard)

| Módulo | Estado (REAL / REAL·FLAG / BLOQUEADO·EXTERNO / PARCIAL / NÃO INICIADO / NÃO VERIFICADO) | Evidência | % |
|---|---|---|---:|
| Conteúdo/Media | PARCIAL | Dispatcher, contrato e worker; storage derivado/staging pendentes | 75 |
| Cortina/Acesso | PARCIAL | Contratos de media existentes e URLs assinados | 65 |
| Moderação | BLOQUEADO·EXTERNO | Pipeline preparado; fornecedor/ambiente de scan não verificado | 45 |
| Conformidade/Arquivo | PARCIAL | Job e auditoria existentes; arquivo final depende do storage | 55 |
| CI/CD | PARCIAL | Checks locais verdes; imagem/serviço ainda não executados no CI | 68 |

## 6. Achados F-xx: resolvidos / adiados (com motivo) / novos achados N-xx

- F-09 — parcial: o fluxo de upload existente mantém scan antes de publicação, mas a execução de worker externo não foi provada em staging.
- F-10 — resolvido no código: dispatcher com claim/reclaim e assinatura evita processamento arbitrário.
- F-11 — adiado: storage de derivados requer adapter e credenciais do ambiente de execução.
- N-03 — novo: a imagem Docker precisa de pipeline CI e imagem publicada antes de ser activada.

## 7. UI · UX · CX · SD — o que melhorou nesta fase (1 linha por lente)

- UI: as cortinas e estados de media existentes continuam a representar conteúdo bloqueado sem revelar o original.
- UX: processamento assíncrono tem estados de fila, processamento, falha e retry no contrato do job.
- CX: conteúdo não é declarado publicado enquanto o scan/moderação não o confirmar.
- SD: o blueprint documenta cliente, worker, storage, moderação, suporte e auditoria.

## 8. Riscos e dívida técnica (honesto)

O worker ainda não escreve derivados no storage; a resposta de sucesso actual é deliberadamente um contrato de integração, não prova de publicação. O scan externo, vídeo/FFmpeg e staging não foram validados. A subida da imagem Docker e o token de worker precisam de secret manager e observabilidade antes de produção.

## 9. Pedidos ao Dono do Produto (credenciais, decisões, pareceres) — com prazo sugerido

- Disponibilizar ambiente de staging com bucket privado, service role limitada ao pipeline e fornecedor de scan — antes de activar o dispatcher.
- Aprovar retenção, dimensões e política de thumbnails/previews — antes de publicar media real.
- Autorizar registry/runner CI para a imagem Docker — antes do próximo checkpoint.

## 10. Plano da próxima fase (5–10 linhas)

Aplicar a migração em staging.
Ligar o adapter de storage privado e verificar o caminho completo.
Executar scan de imagem e vídeo sintético.
Adicionar E2E de upload, processamento, moderação, publicação e URL expirado.
Adicionar logs, métricas e alertas do dispatcher.
Só depois ligar a flag de media em cada ambiente.
