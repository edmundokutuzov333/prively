# RELATÓRIO FASE 5 — Comunicação, lives e avisos discretos

## 1. Resumo executivo (máx. 8 linhas, linguagem simples, sem jargão)

O chat passou a registar o aviso de privacidade no servidor, com superfície e versão.
Mensagens podem pedir tradução no ponto de uso, sem traduzir automaticamente conteúdo bloqueado.
Push usa payload neutro e preferências por categoria, horário silencioso e modo discreto.
Subscrições que respondem 404/410 são removidas para não criar ciclos de reenvio.
O LiveKit tem token curto, webhook idempotente, presença e cobrança por minuto idempotente.
Saldo insuficiente cria uma acção server-side para remover o participante.
As flags continuam desligadas até staging, fornecedor e testes reais passarem.

## 2. Commits e tag

- `b10c5ce` — `fase-5: communication: connect live billing and privacy`
- Tag local: `fase-5-concluida`
- Publicação remota: pendente de atualização autenticada da `main`; não foi usado force push.

## 3. Evidências (colar output REAL, truncado se enorme)

- `npm run typecheck` — passou após as alterações de comunicação.
- `npm run lint` — 0 erros; 1 aviso pré-existente.
- `npm test -- --run` — 5 ficheiros, 14 testes aprovados.
- `npm run check:migrations` — `OK: 167 migrações, sem versões duplicadas`.
- `npm run check:supabase-config` — `OK: 28 funções com verify_jwt explícito`.
- `npm run audit:production` — `Production audit passed: 76 browser files and 35 Edge Function files inspected.`
- `npm audit --omit=dev --audit-level=high` — `found 0 vulnerabilities`.
- `npm run build` — concluído; PWA e service worker gerados.
- LiveKit: documentação oficial confirma `RoomServiceClient.removeParticipant`; staging não foi executado.
- `supabase db reset` / `supabase test db` — não executados neste ambiente; não há prova de aplicação remota das migrações.
- Playwright, dois contextos de media e k6 — não executados nesta fase.

## 4. Critérios de aceitação da fase — cada um ✅ / ❌ / ⚠️ com a evidência

- ✅ Privacidade: RPC `accept_communication_privacy` guarda utilizador, superfície, versão e evento de segurança.
- ✅ Push: payload fixo e neutro, preferências por categoria, silêncio e modo discreto; 404/410 desactiva a subscrição.
- ✅ Live token: TTL de 5 minutos e permissões calculadas pela RPC server-side.
- ✅ Live webhook: assinatura oficial, deduplicação por evento e presença joined/left.
- ✅ Cobrança: chave primária por sessão, pagador e minuto; usa o mesmo débito interno do ledger.
- ✅ Saldo insuficiente: marca participante e cria `remove_participant` para enforcement.
- ⚠️ VAPID, fornecedor de tradução/IA e LiveKit staging não estão configurados; flags ficam OFF.
- ⚠️ E2E com dois JWTs, browser media fake, push Android/iOS e reconexão sem dupla cobrança ainda não foram executados.

## 5. Estado da plataforma (scoreboard)

| Módulo | Estado (REAL / REAL·FLAG / BLOQUEADO·EXTERNO / PARCIAL / NÃO INICIADO / NÃO VERIFICADO) | Evidência | % |
|---|---|---|---:|
| Chat | PARCIAL | Privacidade e tradução ligadas à UI; Realtime/E2E remoto pendente | 60 |
| Lives/Chamadas | BLOQUEADO·EXTERNO | Contratos de token, webhook, billing e enforcement; credenciais/staging ausentes | 45 |
| Push | BLOQUEADO·EXTERNO | Preferências e payload neutro; VAPID e dispositivos não verificados | 35 |
| Tradução/IA | BLOQUEADO·EXTERNO | Cache/opt-in preparados; fornecedor adulto e retenção não aprovados | 30 |
| Carteira/Top-up | BLOQUEADO·EXTERNO | Cobrança usa ledger; provider e migrações remotas pendentes | 60 |
| Segurança física/Pânico | PARCIAL | Botões/contratos existentes; integração operacional pendente | 45 |
| Observabilidade | PARCIAL | Eventos LiveKit e alertas persistidos; SLO/recovery pendentes | 48 |

## 6. Achados F-xx: resolvidos / adiados (com motivo) / novos achados N-xx

- F-16 — parcial: backend de comunicação, push, tradução e live billing foi ligado; fornecedores e E2E externos continuam bloqueados.
- F-17 — resolvido no código: cobrança por minuto ganhou idempotência por minuto e corte server-side.
- F-18 — resolvido no código: push deixa de expor nome, valor ou pré-visualização.
- N-05 — novo: as flags só podem ser ligadas por ambiente depois de registar evidência de staging e aprovação do fornecedor.

## 7. UI · UX · CX · SD — o que melhorou nesta fase (1 linha por lente)

- UI: tradução, cortina e aviso de privacidade aparecem no contexto da mensagem/conversa.
- UX: estados de reconexão, pagamento e indisponibilidade continuam explícitos; flags evitam CTAs falsos.
- CX: o push diz apenas “Tens uma nova mensagem”/actividade e não revela conteúdo sensível.
- SD: presença, eventos, cobrança e enforcement criam trilho para suporte, moderação e finanças.

## 8. Riscos e dívida técnica (honesto)

Push não pode ser declarado recebido sem VAPID e aparelhos de teste. LiveKit não foi executado em staging e o corte depende de segredos do serviço. A tradução e o assistente continuam bloqueados até parecer sobre conteúdo adulto, retenção e treino do fornecedor. A UI ainda precisa de E2E com dois utilizadores para provar que bloqueios não criam oracle.

## 9. Pedidos ao Dono do Produto (credenciais, decisões, pareceres) — com prazo sugerido

- Fornecer chaves VAPID, domínio PWA e aparelhos Android/iOS para teste — antes de ligar push.
- Fornecer LiveKit staging e segredos/API projectados — antes de ligar lives e cobrança.
- Aprovar fornecedor de tradução/IA para conteúdo adulto, retenção zero e orçamento diário — antes de ligar translation/assistant.
- Confirmar a política curta de privacidade de chat/chamadas — antes de exigir aceite em produção.

## 10. Plano da próxima fase (5–10 linhas)

Aplicar as seis migrações novas em staging.
Executar SQL tests de Realtime, bloqueio, ledger e live billing.
Executar E2E com dois JWTs e media fake.
Testar push neutro, 410 e PWA instalada.
Testar LiveKit pública/privada, reconexão e corte por saldo.
Só ligar cada flag no ambiente que tiver evidência verde.
