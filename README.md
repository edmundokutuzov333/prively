# Prively

O teu Privê digital.

Prively está a ser construída como uma plataforma de produção para criadoras adultas, conteúdo protegido, interacção social, privacidade, segurança e monetização em Moçambique.

## Regra de desenvolvimento

A branch de integração e produção do código é main. Todas as alterações desta fase foram executadas directamente em main. Não são criadas branches de trabalho para a construção normal da plataforma.

A documentação funcional anexada ao projecto é a fonte de verdade para arquitectura, segurança, UX, conteúdo e critérios de aceitação. fileciteturn0file0L288-L322

## Stack

- React 19 + TypeScript
- Vite + Tailwind CSS 4
- Supabase Auth + PostgreSQL + RLS + Storage + Edge Functions
- TUS para uploads resumíveis
- Vitest + Testing Library
- Testes de regressão SQL nativos executáveis directamente no PostgreSQL
- Playwright preparado para E2E
- Vercel para frontend
- Node.js 24

## Estado por fase

### Fases 1 a 3

A superfície principal da Prively está implementada em código: cliente, criadora, operações/admin e estados extremos. As funcionalidades que ainda dependem de infraestrutura externa ficam atrás das respectivas flags e não são apresentadas como live quando o backend não está pronto.

### Fase 4

O núcleo de identidade e segurança está ligado ao Supabase Auth, papéis, permissões, RLS, age verification, KYC, consentimentos, estados de conta e funções server-side. A regra estrutural é que a UI não decide permissões.

### Fase 5, Content Engine & Media Infrastructure

A camada de conteúdo e media real está implementada com:

- posts, channels, tiers e visibilidade;
- stories e PPV;
- uploads privados e uploads resumíveis via TUS;
- bucket prively-private privado;
- media_assets com integridade, processamento, moderação e watermark;
- SHA-256 calculado server-side pelo worker, com validação opcional do hash indicado pelo cliente;
- jobs de integridade, arquivo, moderação, thumbnail, watermark e HLS;
- signed URLs de curta duração através do fluxo de media autorizado;
- can_view_post() e get_media_access() como autoridade de acesso;
- logs de acesso a media;
- bucket compliance-archive privado;
- arquivo de conformidade com retention_days proveniente de platform_settings;
- consentimento associado a cada upload;
- endpoint get-media-preview para previews bloqueados, devolvendo apenas derivados seguros e nunca o ficheiro original;
- Cortina ligada ao preview seguro em vez de blur CSS do ficheiro original;
- fila operacional de processamento para moderadores/admin;
- recuperação de jobs concorrentes através de claim condicional;
- publicação impedida enquanto a media necessária não estiver pronta.

A especificação exige explicitamente que o ficheiro real nunca seja entregue enquanto não existir autorização e que a Cortina receba apenas uma miniatura borrada gerada no servidor. fileciteturn0file0L304-L322 fileciteturn0file0L953-L959

## Segurança de media

Todos os buckets de media são privados. O acesso normal usa a função server-side de media e URLs assinadas de curta duração. A especificação determina RLS, URLs assinadas de 60 segundos, logs de acesso e nenhuma entrega do ficheiro real para utilizadores sem autorização. fileciteturn0file0L1066-L1075

O arquivo de conformidade também permanece privado, fora das interfaces de cliente e criadora, e deve ser acessível apenas pelos papéis autorizados e sempre auditado. fileciteturn0file0L778-L780

## O que ainda depende de infraestrutura externa

O worker de media já está activo na Supabase. Os jobs que dependem de um fornecedor externo de processamento ou moderação ficam bloqueados de forma explícita quando MEDIA_PROCESSOR_ENDPOINT ou MEDIA_SCAN_ENDPOINT não estão configurados. Isto é intencional: a plataforma não fabrica resultados de moderação, thumbnails, HLS ou watermark.

O dispatcher automático de jobs foi mantido desligado nesta fase porque não foi possível certificar, com o nível de segurança exigido, a autenticação interna entre PostgreSQL e Edge Function. O processamento autorizado continua disponível através do worker autenticado e da fila operacional. Não há trigger ou cron não autenticado a consumir a fila.

## Estado de deploy

O repositório está ligado ao pipeline Vercel e os commits anteriores desta implementação receberam validação de deployment com estado `success`. Para o último commit desta fase, o endpoint de status do GitHub ainda não devolveu um check Vercel, por isso esse deployment específico não é apresentado como concluído sem confirmação do próprio Vercel.

A configuração Vercel permanece versionada no repositório com `npm run build`, output `dist` e rewrite SPA. O domínio existente não foi alterado nesta fase.

## Dados de produção

Não foram introduzidos criadores, clientes, media ou métricas fictícias na base de dados de produção. No momento da auditoria da Fase 5, as tabelas media_uploads, media_processing_jobs e compliance_objects estavam sem registos de produção.

A especificação proíbe explicitamente dados fictícios, contadores fabricados, criadoras fictícias e funcionalidades fingidas em produção. fileciteturn0file0L737-L750

## Fase 6, Wallet, Ledger & Payments Core

A Fase 6 está implementada no núcleo financeiro real, sem saldos simulados.

- ledger append-only com partidas dobradas e trigger diferido que exige pelo menos duas linhas e soma zero;
- balances derivadas do ledger e sem permissões de escrita directa para cliente;
- idempotência nas intenções financeiras e no fluxo de pagamentos;
- comissão configurável por platform_settings;
- creator_pending e creator_available com retenção configurável;
- top-ups com estados pending, processing, paid, failed, cancelled, expired e reversed;
- eventos de webhook com HMAC e deduplicação por provider + event_id;
- payouts com destino cifrado, estados, aprovação financeira e reversão;
- refunds por lançamentos compensatórios, nunca por alteração histórica;
- escrow real com hold, release e refund;
- renewals de subscrições por pg_cron;
- spend limits diário, semanal e mensal aplicados no servidor no fuso Africa/Maputo;
- reconciliação de ledger com alerta de divergência e histórico da execução;
- FX em MZN como moeda contabilística, com tabela de taxas e worker horário configurável;
- invoices e receipts financeiros;
- exportação privada de histórico CSV e recibo PDF;
- Finance Guard separado do Admin Guard, com MFA/AAL2 obrigatório;
- interface real para carteira do cliente, ganhos da criadora, limites de gasto e Control Room financeiro.

As funções financeiras críticas estão protegidas por SECURITY DEFINER, e os caminhos internos de top-up, payout e reconciliação não ficam expostos ao papel anon. O browser não escreve balances nem ledger_entries.

### Provider de pagamentos

A arquitectura está pronta para o adapter Paysuite para M-Pesa, e-Mola, mKesh, Ponto24 e cartão. O código usa URLs, chaves e formato de assinatura configuráveis por secrets. Não existem credenciais no cliente.

A integração não é declarada como operacional até existirem as credenciais e os endpoints oficiais da conta de produção. Enquanto isso, a UI apresenta os estados reais de configuração e não cria pagamentos fictícios.

### Estado dos pagamentos

O núcleo financeiro executa o fluxo de top-up e payout através de Edge Functions, mas saldo só é criado ou retirado quando o estado financeiro correspondente é confirmado pelo backend ou provider. Um provider indisponível não cria saldo.

O cartão está desactivado pela configuração de produção até existir PSP aprovado e integração validada.

### Segurança financeira

Acesso a destinos de payout exige AAL2 e fica registado no financial audit log. Aprovação, rejeição e reconciliação financeira também exigem AAL2.

A retenção do arquivo de conformidade da Fase 5 continua configurável separadamente.


### Step-up para levantamentos

Levantamentos de criadora exigem KYC aprovado, telefone confirmado e uma verificação MFA recente. A UI usa o MFA Phone do Supabase para enviar o código por SMS e elevar a sessão para AAL2; o RPC de payout volta a validar estas condições no servidor. O Supabase documenta Phone MFA como segundo factor suportado e a promoção da sessão para AAL2 após a verificação bem sucedida. citeturn858121search0turn858121search2

### Princípio de secrets

As chaves de provider ficam exclusivamente no ambiente seguro das Edge Functions. O browser não recebe chaves secretas nem service role. A documentação actual do Supabase recomenda secret keys apenas em backend e validação específica para funções autenticadas ou webhooks. citeturn835509search0turn835509search1turn835509search4

### Estado de produção da Fase 6

Implementado e aplicado no Supabase:
- schema financeiro;
- RPCs financeiras;
- cron jobs;
- Edge Functions payments-create-topup, payments-webhook, payout-process, financial-export e fx-refresh;
- UI de carteira, ganhos, limites e financeiro;
- testes SQL financeiros.

Ainda dependem de configuração externa real:
- credenciais e endpoints do provider de pagamentos;
- origem oficial de FX;
- OTP telefónico específico para levantamentos, que não existia nas fases anteriores e não foi fingido como implementado.

## Fase 8 · Safety, Moderation & Trust

A Fase 8 foi implementada na `main` com backend real e sem transformar encontros sociais em produto monetário. O documento define Reports, fila de moderação, IA e moderação humana, Appeals, Audit Trail, Compliance Access, Admin Access Log, Safety Check-in, Trusted Contacts, Panic Button, Meeting Availability, Meeting Requests, Safe Venues, Location Expiry, Emergency Alerts, DMCA, Anti-leak, Watermark Tracking e Legal Holds. fileciteturn172file0L691-L751

### Moderação
- `reports` recebe denúncias de perfil, post, mensagem, comentário, media e encontro, com prioridade server-side para categorias críticas.
- `moderation_queue` e `moderation_actions` formam a fila operacional e o trilho de decisões humanas. A fila mantém referência exacta ao post, media, mensagem e appeal que originou o caso.
- `submit_appeal()` permite recurso após decisão e mantém o caso auditável.
- `moderation-scan` é uma Edge Function real. Só chama fornecedor externo quando `feature_flags.ai_moderation=true` e as secrets do provider existem. Sem provider não inventa classificação.
- Conteúdo sinalizado pela IA pode ser removido/blocked automaticamente e fica disponível para decisão humana posterior.

### Compliance View e auditoria
- `audit_log` é append-only e tem hash chain entre eventos.
- `admin_access_log` regista quem acedeu a conteúdo privado, o alvo, o tipo de acesso, o motivo e a aprovação secundária.
- `compliance_access_requests` exige motivo escrito, expiração de 30 minutos e segunda pessoa para DMs quando não existe ordem judicial.
- `compliance_read_message()` só funciona com um access request aprovado, valida o alvo exacto e regista o acesso efectivo em `admin_access_log` e `audit_log`.
- Policies administrativas genéricas foram removidas das superfícies sensíveis da Fase 7 e a Fase 8 mantém essa fronteira.

### Segurança física
- `trusted_contacts`, `safety_checkins`, `panic_events` e `safety_location_shares` foram implementados com RLS.
- A localização é opcional e expira/purga automaticamente depois de 24 horas.
- `safety-alert-dispatch` notifica o suporte dentro da plataforma e integra contactos externos através de webhook HMAC quando o provider de segurança estiver configurado. Check-ins expirados também geram notificações internas pelo job server-side.
- O sistema nunca apresenta uma notificação falsa de SMS enviado. Sem provider, o estado é `not_configured`.
- O painel de Emergências lê incidentes através de RPC server-side e permite resolução auditada.

### Encontros sociais
A especificação determina explicitamente a separação entre encontro social e transacção. fileciteturn172file0L737-L751

- `availability_slots` fornece janelas de disponibilidade.
- `meeting_requests` permite pedido, aceitação, recusa, cancelamento e expiração.
- `safe_venues` aceita apenas `cafe`, `restaurante` e `centro_comercial`.
- `meeting_requests`, `availability_slots` e `safe_venues` não têm campos de preço, pagamento, comissão ou escrow.
- Não existem hotéis ou alojamentos neste módulo.
- O pedido de encontro continua ligado ao DM normal e não cria qualquer transacção financeira.

### DMCA e anti-leak
- `dmca_requests` recebe pedidos públicos de remoção com validação básica e fila jurídica/moderação.
- `legal_holds` bloqueia retenção de evidência até libertação explícita pela conformidade.
- `watermark_events` regista a utilização da marca de água por asset, utilizador, contexto e token hash.
- A plataforma mantém a dissuasão e rastreabilidade, sem prometer bloqueio de screenshots. Isso está alinhado com a regra da especificação. fileciteturn172file0L1154-L1156

### UI/UX/CX/SD
- As rotas de cliente incluem `Encontros sociais` e `Denúncias`.
- A criadora tem `Segurança`, `Check-in`, `Pânico` e `Encontros sociais` funcionais.
- Admin tem `Moderação`, `Conformidade`, `Legal Holds`, `Locais seguros` e `Emergências`.
- Perfil, post e mensagem têm acção de denúncia real ligada ao backend.
- O DMCA público usa formulário real, não placeholder.
- As cópias respeitam o tom pt-MZ do documento e evitam promessas falsas de segurança. fileciteturn172file0L1031-L1108

### Testes e regressão
- `supabase/tests/database/phase8_safety_moderation_meetings_test.sql`: **16/16 critérios aprovados** directamente no projecto Supabase.
- `supabase/tests/database/phase7_social_realtime_test.sql`: **24/24 critérios aprovados** novamente depois da Fase 8.
- Regressão do núcleo financeiro confirmou ledger, balances, topups, payouts, escrow e os contratos públicos/internos sem alterações indevidas.
- O hardening final removeu execução pública de helpers internos da Fase 8 e corrigiu policies e índices que afectavam `moderation_scans` e `financial_audit_log`.

### Integrações externas ainda condicionadas
- IA de moderação: `feature_flags.ai_moderation=false` até existir provider aprovado e secrets configuradas.
- Alertas SMS/contactos: `feature_flags.safety_alerts=false` até existir provider/webhook seguro.
- LiveKit, Push e tradução continuam controlados pelas flags das fases anteriores quando as credenciais externas não estão disponíveis.
- O código não apresenta nenhuma destas integrações como activa enquanto o provider real não estiver configurado.

## Próxima fase

A próxima fase é a **Fase 9, Business Engine & Advanced Monetization**, que deve reaproveitar os contratos de segurança, social, meetings e compliance já estabilizados. A especificação posiciona aqui Custom Requests, Escrow, Auctions, Anti-sniping, Bundles, Promotions, Gifts, Product Store, Orders, Giveaways, Loyalty, Rankings, Creator Analytics, Fan CRM, Goals, Referral, Agency, Premium Features, Recommendation Engine, Translation, AI Response Assistant, Auto Captions, Face Blur e processamento avançado. fileciteturn172file0L753-L823

## Validação antes de produção pública

A conclusão de código não é suficiente para abrir publicamente a plataforma. A própria especificação exige validação jurídica, termos publicados, KYC, detecção de conteúdo ilegal, equipa de moderação e suporte, criadoras verificadas e teste externo de segurança antes do lançamento público. fileciteturn0file0L543-L545

## Fase 7 · Social Graph, Realtime & Communication

A Fase 7 foi implementada na `main` com backend real, RLS, RPCs, Realtime, Presence, chat, anexos privados, mensagens bloqueadas, notificações e contratos server-side para chamadas e LiveKit. As migrations de reconciliação e hardening desta fase foram aplicadas ao projecto Supabase e a suite de regressão devolveu 24/24 critérios aprovados.

### Social Graph
- `follows`, `blocks` e `hidden_from` com mutações por RPC e verificação server-side.
- Bloqueio é aplicado no acesso a conteúdo, conversas, mensagens e salas.
- Comentários e reacções usam RLS ligado a `can_view_post`.
- Wishlist usa RPCs idempotentes de leitura/escrita autorizada.
- A função interna de bloqueio não fica exposta como um oracle a clientes.

### Chat e Realtime
- `conversations`, `conversation_members` e `messages` permanecem protegidos por RLS.
- Corrigida a vulnerabilidade anterior em que a política de mensagens usava uma condição tautológica.
- Envio passa por `send_message_v2()`; o cliente não insere mensagens directamente.
- Mensagens pagas usam o ledger da Fase 6. Mensagens bloqueadas usam `message_locked_content` e `unlock_message()`.
- Estado de leitura é persistido com `mark_message_read()` e `mark_conversation_read()`.
- Presence de digitação usa tópico separado `typing:<conversation-id>`; alterações Postgres usam `conv:<conversation-id>`.
- A publicação `supabase_realtime` inclui as tabelas necessárias para comunicação e actividade social.

### Attachments
- Bucket privado `prively-chat`.
- Upload através de URL assinada temporária.
- Anexo só muda de `pending` para `attached` quando a mensagem autorizada é criada.
- Leitura usa URL assinada de 60 segundos e passa pela RLS de membros e pela regra de desbloqueio.
- Edge Functions activas: `chat-attachment-upload-url` e `chat-attachment-url`.

### Privacy e notificações
O aviso de privacidade das conversas segue o texto definido na especificação e aparece no primeiro acesso da conversa. As notificações não copiam corpo de mensagens nem dados reais para o payload.

Existe agora infraestrutura Web Push com:
- `push_subscriptions` e registo por RPC.
- Service worker próprio com Workbox e tratamento de `push`/click.
- `process-push-notifications` como Edge Function privada por token de job.
- Flag `feature_flags.push=false` enquanto VAPID ainda não estiver configurado.

### Chamadas e Live
- `start_call()`, `heartbeat_call()`, `end_call()` e `bill_active_calls()`.
- Billing por minuto é server-side e usa o ledger, nunca o cliente.
- Heartbeat perdido encerra a sessão por timeout.
- Saldo insuficiente encerra a chamada e gera notificação neutra.
- `live_sessions` suporta `free`, `paid` e `private`, com `private_client_id`, `per_minute_price` e heartbeat.
- `create_live_session()`, `heartbeat_live()`, `end_live()` e `bill_private_live_sessions()` foram implementados.
- LiveKit continua atrás de flag enquanto as credenciais e endpoint externos não estiverem certificados.

### Tradução
A Edge Function `translate-message` existe com cache em `message_translations`, mas permanece desligada por `feature_flags.translation=false` até existir um fornecedor aprovado para conteúdo adulto e as respectivas secrets.

### Segurança e regressão
- `chat_rate_limits` tem RLS activo e não pode ser lida ou alterada pelos papéis de cliente.
- As policies da Fase 7 foram optimizadas para avaliar `auth.uid()` uma vez por statement, reduzindo custo por linha em Realtime e chat.
- Foram adicionados índices para FKs críticas de mensagens, polls e wishlist.
- Foi removido o índice duplicado de mensagens e a constraint redundante de votos.
- Foi criada uma API de `can_view_post(uuid)` limitada ao utilizador autenticado. A variante que aceita um `user_id` arbitrário permanece interna.
- Políticas administrativas genéricas foram removidas das tabelas de comunicação privada; acesso de conformidade continuará a ser feito através da camada específica de Compliance View da Fase 8.
- O RPC legado `send_message(uuid,text)` deixou de ser executável pelo cliente. O único caminho público para envio é `send_message_v2()`, que aplica rate limit, autorização, DM mode e cobrança server-side.
- Os oracles `is_blocked()` e `is_hidden_from()` continuam internos.
- Os índices duplicados de anexos e traduções foram removidos da produção e o migration file foi corrigido para não os recriar em instalações novas.
- A suite `supabase/tests/database/phase7_social_realtime_test.sql` usa SQL nativo, sem depender de pgTAP.
- Validação Supabase da Fase 7: **24/24 critérios aprovados** antes e depois do hardening de performance.
- O migration final de performance foi aplicado no Supabase sem alteração de dados de produção.

### Estado de integração

Operacional no Supabase: schema, RLS, RPCs, storage privado, Realtime publication, Presence contracts, chat, notificações, anexos privados e billing server-side das chamadas.

Ainda condicionado a configuração externa: VAPID para Push, fornecedor de tradução aprovado, credenciais LiveKit e ligação de produção da Vercel. A Fase 7 não activa estes caminhos como se estivessem configurados quando as credenciais reais não existem.
