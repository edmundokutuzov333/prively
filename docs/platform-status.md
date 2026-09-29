# Estado da plataforma — 2026-09-29

Os scores abaixo reflectem código e testes locais. As migrações F2–F5 ainda aguardam aplicação e verificação no Supabase remoto nesta execução; por isso nenhum módulo externo é declarado como produção sem essa evidência.

| Módulo | Estado | Evidência | % |
| --- | --- | --- | ---: |
| Contas | PARCIAL | Auth endurecida, sem auto-confirmação; E2E remoto pendente | 75 |
| Age/KYC | BLOQUEADO·EXTERNO | KYC assinado e idempotente; fornecedor/credenciais ausentes | 50 |
| Perfis | PARCIAL | Handles e papéis limitados no servidor | 60 |
| Conteúdo/Media | PARCIAL | Dispatcher, worker assinado e preview testada; staging/storage derivados pendentes | 75 |
| Cortina/Acesso | PARCIAL | Gate e URLs assinados existentes; E2E incompleto | 65 |
| Carteira/Top-up | BLOQUEADO·EXTERNO | Unidade, quarentena, limites e reconciliação; Paysuite ausente e flag off | 60 |
| Assinaturas/PPV | PARCIAL | Ledger/RPCs existentes; dinheiro real bloqueado | 50 |
| Escrow/Pedidos/Leilões | PARCIAL | Funções e ledger existentes; fluxo crítico não verificado | 50 |
| Levantamentos | BLOQUEADO·EXTERNO | Payout webhook endurecido; provider ausente | 35 |
| Chat | PARCIAL | Realtime/anexos/privacy/translation UI; E2E com dois JWTs pendente | 60 |
| Lives/Chamadas | BLOQUEADO·EXTERNO | Token, webhook, cobrança e enforcement no código; LiveKit/staging ausentes | 45 |
| Push | BLOQUEADO·EXTERNO | Payload neutro, preferências e limpeza 404/410; VAPID/provider não verificados | 35 |
| Tradução/IA | BLOQUEADO·EXTERNO | Botão/cache/flag preparados; fornecedor e orçamento não aprovados | 30 |
| Descoberta/Feed | PARCIAL | Rotas/UI existentes; dados reais não verificados | 45 |
| Moderação | BLOQUEADO·EXTERNO | Pipeline fail-closed; scanner externo ausente | 45 |
| Segurança física/Pânico | PARCIAL | RPC/Edge Functions presentes; operação não verificada | 45 |
| Encontros | PARCIAL | Schema/rotas presentes; fluxo não verificado | 35 |
| Conformidade/Arquivo | PARCIAL | Aceites e trilhos novos; operação de retenção não verificada | 55 |
| Admin/Finanças | PARCIAL | Alertas, guards e RPCs; produção não verificada | 60 |
| Suporte | PARCIAL | Tickets/schema presentes; operação não verificada | 35 |
| i18n | PARCIAL | pt-MZ/en/fr existentes; paridade automática não criada | 65 |
| PWA/Discreto | PARCIAL | PWA compila; PIN v2 testado localmente | 65 |
| CI/CD | PARCIAL | Checks locais verdes; CI, deploy e staging pendentes | 68 |
| Observabilidade | PARCIAL | Alertas financeiros persistidos; SLO e recovery não verificados | 48 |
| Backups | NÃO VERIFICADO | Não houve recovery drill nesta sessão | 0 |
