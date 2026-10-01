# Estado da Plataforma Prively

**Data: 1 de Outubro de 2026
**Regra da percentagem:** só é indicada quando existe uma fracção objectivamente verificável. `N/D` significa que dar um número seria inventar precisão.

| Módulo | Estado | Evidência | % verificável |
|---|---|---|---:|
| Contas | PARCIAL | Auth/config real; E2E de rotas falhou na baseline | N/D |
| Age/KYC | PARCIAL | KYC RPCs, RLS, AAL2 indirecto via `has_permission`; sandbox não validado | N/D |
| Perfis | PARCIAL | Profiles + RLS + admin users RPC | N/D |
| Conteúdo/Media | PARCIAL | upload, processing, access, worker contracts; E2E não repetido | N/D |
| B2 Media Originals | PARCIAL | B2 observado no runtime e funções activas; Secret e CORS externos ainda não confirmados directamente | N/D |
| Cortina/Acesso | PARCIAL | `can_view_post` e `get_media_access` activos; readiness de derivados foi endurecido fail-closed, mas processor/staging continuam por validar | N/D |
| Carteira/Top-up | PARCIAL | reconcile=0, zero saldos negativos, webhook/idempotência no código | N/D |
| Assinaturas/PPV | PARCIAL | contratos financeiros e testes Phase 6 presentes | N/D |
| Escrow/Pedidos/Leilões | PARCIAL | suite Phase 9 baseline passou | 100% dos 18 checks Phase 9 nativos observados |
| Levantamentos | PARCIAL | `approve_payout` e `payout-process` com AAL2; sandbox não validado | N/D |
| Chat | PARCIAL | RLS, RPCs, privacy wrapper e correcção do core | N/D |
| Lives/Chamadas | PARCIAL | LiveKit token/webhook, billing e heartbeat contracts | N/D |
| Push | REAL·FLAG | worker activo; flag false | N/D |
| Tradução/IA | REAL·FLAG | functions activas; flags false | N/D |
| Descoberta/Feed | PARCIAL | recomendações/featured e guards presentes | N/D |
| Moderação | REAL·FLAG | moderation-scan activo; fornecedor não verificado | N/D |
| Segurança física/Pânico | REAL·FLAG | RPC + safety-alert-dispatch; flag false | N/D |
| Encontros | REAL·FLAG | suite Phase 8 passou; feature meetings=true | N/D |
| Conformidade/Arquivo | PARCIAL | append-only audit + legal hold + compliance flow | N/D |
| Admin/Finanças | PARCIAL | roles, permissions, finance AAL2 e RLS | N/D |
| Suporte | PARCIAL | support RPCs e RLS | N/D |
| i18n | NÃO VERIFICADO | não houve suite de paridade executada | 0% verificável nesta sessão |
| PWA/Discreto | PARCIAL | testes do PIN presentes; E2E incompleto | N/D |
| CI/CD | PARCIAL | quality verde na baseline; DB/E2E vermelhos; novo CI não executado | N/D |
| Observabilidade | PARCIAL | Supabase logs consultáveis; Vercel não verificável | N/D |
| Backups | NÃO VERIFICADO | não houve prova operacional de restore nesta sessão | N/D |

## Gate actual

**Não pronto para produção.**

Bloqueadores:
- CI do commit de correcção ainda não executado.
- Reconciliacao logica ainda requer decisao/procedimento: 205 ficheiros locais versus 203 versoes remotas, com renumeracoes entre historicos.
- Backup restore drill continua bloqueado sem staging Supabase.
- Projecto Vercel oficial Prively nao existe na equipa Vercel ligada ao conector.
- CI da correccao actual ainda em execucao.
- Integrações externas não validadas em sandbox.
