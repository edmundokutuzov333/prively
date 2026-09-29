# Service blueprint — publicar conteúdo

| Momento | Criadora | Sistema | Moderação | Conformidade |
|---|---|---|---|---|
| Preparar | escolhe ficheiro, visibilidade e declara consentimento | valida KYC, termos, tamanho e caminho privado | — | — |
| Carregar | vê progresso e retoma | TUS, hash, idempotência | — | — |
| Processar | vê “a processar” | jobs com claim, derivados, watermark e HLS | recebe conteúdo retido | arquiva cópia conforme retenção |
| Rever | vê motivo humano se recusado | fail-closed até scan limpo | decide flagged/review | acesso AAL2 e trilho |
| Publicar | escolhe agora/agendar | só `ready` pode ser `published` | pode bloquear | retenção e DMCA auditáveis |
| Ver | — | cortina ou URL assinada por 60 s | — | acesso justificado |
