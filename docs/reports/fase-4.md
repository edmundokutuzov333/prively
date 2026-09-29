# RELATÓRIO FASE 4 — Dinheiro real e reconciliação

## 1. Resumo executivo (máx. 8 linhas, linguagem simples, sem jargão)

Os valores enviados ao fornecedor de pagamentos deixaram de ser ambíguos.
O sistema exige configuração explícita para valores em unidades maiores ou menores.
Webhooks usam HMAC, janela anti-replay e identificador determinístico quando o fornecedor não envia um.
Eventos inválidos ficam em quarentena e geram alerta financeiro, em vez de serem repetidos indefinidamente.
Foi criado um reconciliador protegido por token para pagamentos pendentes.
O limite de saldo, limites de recarga e flag de produção ficam no servidor.
Carteira de produção permanece desligada até validação do fornecedor e staging.

## 2. Commits e tag

- `c44f2b0` — `fase-4: finance: harden money units and reconciliation`
- Tag local: `fase-4-concluida`
- Publicação remota: pendente de atualização autenticada da `main`; não foi usado force push.

## 3. Evidências (colar output REAL, truncado se enorme)

- `npm run typecheck` — passou.
- `npm run lint` — 0 erros; 1 aviso pré-existente.
- `npm test -- --run` — 5 ficheiros, 14 testes aprovados.
- `npm run check:migrations` — `OK: 167 migrações, sem versões duplicadas`.
- `npm run audit:production` — `Production audit passed: 76 browser files and 35 Edge Function files inspected.`
- `npm audit --omit=dev --audit-level=high` — `found 0 vulnerabilities`.
- `npm run build` — concluído; bundle Vite e service worker gerados.
- Teste de concorrência — script criado, mas não executado: exige `DATABASE_URL`, utilizador e canal de staging.
- `supabase db reset` / `supabase test db` — não executados neste ambiente; sem evidência de aplicação remota desta migração.
- Playwright / k6 — não executados nesta fase.

## 4. Critérios de aceitação da fase — cada um ✅ / ❌ / ⚠️ com a evidência

- ✅ Unidade do montante é obrigatória (`major` ou `minor`) e conversão rejeita formatos inválidos.
- ✅ Webhook verifica HMAC, timestamp quando configurado, idempotência por evento e usa hash determinístico como fallback.
- ✅ Falhas permanentes de valor/referência ficam `quarantined` e criam alerta financeiro.
- ✅ Reconciliador não expõe endpoint público sem token e não inventa estado quando o fornecedor está ausente.
- ✅ Limites de recarga e flag `wallet.production_enabled=false` são aplicados por trigger servidor.
- ⚠️ Paysuite não está ligado: faltam URL, chave, segredo, unidade confirmada e sandbox acessível.
- ⚠️ Teste de concorrência e suites SQL exigem staging/CLI/credenciais que não estão disponíveis nesta execução.

## 5. Estado da plataforma (scoreboard)

| Módulo | Estado (REAL / REAL·FLAG / BLOQUEADO·EXTERNO / PARCIAL / NÃO INICIADO / NÃO VERIFICADO) | Evidência | % |
|---|---|---|---:|
| Carteira/Top-up | BLOQUEADO·EXTERNO | Guardas e reconciliação prontos; provider ausente e flag off | 60 |
| Assinaturas/PPV | PARCIAL | Ledger e contratos existentes; dinheiro real ainda bloqueado | 50 |
| Escrow/Pedidos/Leilões | PARCIAL | Ledger existente; reconciliação externa pendente | 50 |
| Levantamentos | BLOQUEADO·EXTERNO | Webhook de payout endurecido; provider não configurado | 35 |
| Admin/Finanças | PARCIAL | Alertas e estados de quarentena adicionados | 60 |
| Observabilidade | PARCIAL | Alertas financeiros persistidos; endpoint externo pendente | 48 |

## 6. Achados F-xx: resolvidos / adiados (com motivo) / novos achados N-xx

- F-12 — resolvido no código: unidade monetária não é inferida silenciosamente.
- F-13 — resolvido no código: eventos sem forma válida deixam de ser reprocessados indefinidamente.
- F-14 — adiado: reconciliação real depende de sandbox/credenciais Paysuite.
- N-04 — novo: activar a carteira sem confirmar a unidade de montante do fornecedor é proibido pela configuração obrigatória.

## 7. UI · UX · CX · SD — o que melhorou nesta fase (1 linha por lente)

- UI: o fluxo existente recebe o valor do utilizador em unidade maior e o servidor converte explicitamente.
- UX: falhas de pagamento passam a ter estados de pendente, falhado, expirado e quarentena no backend.
- CX: nenhum CTA deve sugerir recarga concluída sem confirmação do webhook/reconciliador.
- SD: alertas, eventos brutos e referências permitem investigação financeira sem apagar o ledger.

## 8. Riscos e dívida técnica (honesto)

Não foi possível validar o formato real do Paysuite nem executar um pagamento sandbox. A função de reconciliação tem um adapter genérico e só deve ser activada depois de confirmar a documentação oficial do fornecedor. A migração bloqueia topups até uma decisão operacional explícita, e os testes de concorrência continuam sem execução em base de staging.

## 9. Pedidos ao Dono do Produto (credenciais, decisões, pareceres) — com prazo sugerido

- Fornecer credenciais Paysuite sandbox, documentação de assinatura, unidade de valores, estados e URL de consulta — antes de activar top-ups.
- Confirmar limites MZN de saldo, recarga diária, mínimo e máximo — antes do primeiro teste financeiro.
- Disponibilizar staging com utilizadores sintéticos e autorizar execução do teste de concorrência — antes de produção.

## 10. Plano da próxima fase (5–10 linhas)

Validar live billing e idempotência por minuto.
Aplicar migrações em staging e correr suites SQL nativas.
Executar pagamento sandbox, webhook duplicado e reconciliação.
Executar teste concorrente de débito com o ledger.
Só activar a flag financeira depois de validar o saldo e os alerts.
