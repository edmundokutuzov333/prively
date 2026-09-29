# Estado da plataforma — 2026-09-29

| Módulo | Estado | Evidência | % |
| --- | --- | --- | ---: |
| Contas | PARCIAL | Auth/RPCs existentes; confirmação e E2E completo não verificados | 60 |
| Age/KYC | BLOQUEADO·EXTERNO | KYC manual; provider externo não configurado | 35 |
| Perfis | PARCIAL | Schema e rotas existentes; fluxo completo não verificado | 55 |
| Conteúdo/Media | REAL·FLAG | Storage privado e pipeline fail-closed; processador externo ausente | 65 |
| Cortina/Acesso | PARCIAL | Gate server-side existente; cobertura E2E incompleta | 60 |
| Carteira/Top-up | BLOQUEADO·EXTERNO | Ledger/RPCs existentes; provider de pagamentos ausente | 45 |
| Assinaturas/PPV | PARCIAL | Contratos SQL existentes; provider e E2E não verificados | 45 |
| Escrow/Pedidos/Leilões | PARCIAL | Funções e migrações existentes; fluxo crítico não verificado | 50 |
| Levantamentos | BLOQUEADO·EXTERNO | Paysuite/SMS não configurados | 30 |
| Chat | PARCIAL | Realtime e anexos existentes; E2E incompleto | 55 |
| Lives/Chamadas | BLOQUEADO·EXTERNO | LiveKit adapter presente; credenciais/provider não verificados | 35 |
| Push | BLOQUEADO·EXTERNO | Function presente; VAPID/job token não verificados | 25 |
| Tradução/IA | BLOQUEADO·EXTERNO | Functions presentes; providers não configurados | 25 |
| Descoberta/Feed | PARCIAL | Rotas/UI existentes; dados reais não verificados | 45 |
| Moderação | BLOQUEADO·EXTERNO | Scanner provider ausente; fail-closed | 40 |
| Segurança física/Pânico | PARCIAL | RPC/Edge Function presentes; webhook não verificado | 45 |
| Encontros | PARCIAL | Schema/rotas presentes; fluxo não verificado | 35 |
| Conformidade/Arquivo | PARCIAL | Audit/archive schema existente; operação não verificada | 50 |
| Admin/Finanças | PARCIAL | Guards/RPCs presentes; AAL2 e produção não verificados | 50 |
| Suporte | PARCIAL | Tickets/schema presentes; operação não verificada | 35 |
| i18n | PARCIAL | pt-MZ/en/fr existentes; paridade automática ainda não criada | 65 |
| PWA/Discreto | PARCIAL | PWA compila; PIN seguro ainda não implementado | 45 |
| CI/CD | PARCIAL | Quality CI verde e `supabase db reset` verde no run `36572751842`; suite SQL canónica falha; Environment reviewer, Vercel e staging pendentes | 65 |
| Observabilidade | PARCIAL | health/client-error ativos; alertas e SLO não verificados | 40 |
| Backups | NÃO VERIFICADO | Não houve recovery drill nesta sessão | 0 |
