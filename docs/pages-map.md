# Mapa de páginas Prively

Esta tabela representa a estrutura criada nesta sessão. Cada pasta de página contém `index.ts`, componente `.tsx`, `.types.ts`, `.test.tsx` e `README.md`.

| # | Pasta | Rota | Papel da página | Teste |
|---:|---|---|---|---|
| 1 | `public/BecomeCreator` | `/se-criadora` | 8 páginas públicas não-home | sim |
| 2 | `public/Legal/Terms` | `/legal/termos` | documento legal | sim |
| 3 | `public/Legal/Privacy` | `/legal/privacidade` | documento legal | sim |
| 4 | `public/Legal/ForbiddenContent` | `/legal/conteudo-proibido` | regras de conteúdo | sim |
| 5 | `public/Legal/Refunds` | `/legal/reembolsos` | reembolsos | sim |
| 6 | `public/Legal/Cookies` | `/legal/cookies` | cookies | sim |
| 7 | `public/Legal/Dmca` | `/legal/dmca` | remoção de conteúdo | sim |
| 8 | `public/Legal/Contacts` | `/legal/contactos` | contactos | sim |
| 9 | `auth/AgeGate` | `/idade` | confirmação de idade | sim |
| 10 | `auth/Register` | `/registar` | registo | sim |
| 11 | `auth/Login` | `/entrar` | entrada | sim |
| 12 | `auth/Recover` | `/recuperar` | recuperação | sim |
| 13 | `auth/Verification` | `/verificacao` | verificação | sim |
| 14 | `auth/OnboardingClient` | `/boas-vindas` | onboarding cliente | sim |
| 15 | `auth/OnboardingCreator` | `/se-criadora/passos` | onboarding criadora | sim |
| 16 | `client/Feed` | `/feed` | feed | sim |
| 17 | `client/Discover` | `/descobrir` | descoberta | sim |
| 18 | `client/CreatorProfile` | `/c/:handle` | perfil | sim |
| 19 | `client/Subscribe` | `/c/:handle/assinar` | assinatura | sim |
| 20 | `client/PpvPurchase` | `/c/:handle/p/:postId` | PPV | sim |
| 21 | `client/Wallet` | `/carteira` | carteira | sim |
| 22 | `client/Purchases` | `/compras` | compras | sim |
| 23 | `client/Wishlist` | `/desejos` | lista de desejos | sim |
| 24 | `client/Messages` | `/mensagens` | mensagens | sim |
| 25 | `client/Conversation` | `/mensagens/:id` | conversa | sim |
| 26 | `client/Notifications` | `/notificacoes` | notificações | sim |
| 27 | `client/Encounters` | `/encontros` | encontros | sim |
| 28 | `client/Account` | `/definicoes/conta` | conta | sim |
| 29 | `client/Security` | `/definicoes/seguranca` | segurança | sim |
| 30 | `client/Wellbeing` | `/definicoes/bem-estar` | bem-estar | sim |
| 31 | `client/Discreet` | `/definicoes/discreto` | modo discreto | sim |
| 32 | `client/Loyalty` | `/fidelidade` | fidelidade | sim |
| 33 | `client/CustomRequests` | `/pedidos` | pedidos personalizados | sim |
| 34 | `client/Auctions` | `/leiloes` | leilões | sim |
| 35 | `client/Products` | `/produtos` | produtos | sim |
| 36 | `client/Raffles` | `/sorteios` | sorteios | sim |
| 37 | `creator/Studio` | `/estudio` | estúdio | sim |
| 38 | `creator/Wall` | `/estudio/conteudo` | conteúdo | sim |
| 39 | `creator/CreateChannel` | `/estudio/conteudo/criar-canal` | estrutura auxiliar, rota inferida | sim |
| 40 | `creator/Publish` | `/estudio/conteudo/novo` | publicar | sim |
| 41 | `creator/Store` | `/estudio/loja` | loja conteúdo | sim |
| 42 | `creator/Subscriptions` | `/estudio/assinaturas` | assinaturas | sim |
| 43 | `creator/Messages` | `/estudio/mensagens` | mensagens | sim |
| 44 | `creator/Lives` | `/estudio/lives` | lives | sim |
| 45 | `creator/Requests` | `/estudio/pedidos` | pedidos | sim |
| 46 | `creator/Auctions` | `/estudio/leiloes` | leilões | sim |
| 47 | `creator/Promotions` | `/estudio/promocoes` | promoções | sim |
| 48 | `creator/Raffles` | `/estudio/sorteios` | sorteios | sim |
| 49 | `creator/Products` | `/estudio/produtos` | produtos | sim |
| 50 | `creator/Earnings` | `/estudio/ganhos` | ganhos | sim |
| 51 | `creator/Analytics` | `/estudio/analise` | análise | sim |
| 52 | `creator/Fans` | `/estudio/fas` | fãs | sim |
| 53 | `creator/Goals` | `/estudio/metas` | metas | sim |
| 54 | `creator/Referral` | `/estudio/referral` | referral | sim |
| 55 | `creator/Encounters` | `/estudio/encontros` | encontros | sim |
| 56 | `creator/Profile` | `/estudio/perfil` | perfil | sim |
| 57 | `creator/Blocks` | `/estudio/bloqueios` | bloqueios | sim |
| 58 | `creator/Emergency` | `/estudio/emergencia` | suporte | sim |
| 59 | `shared/Settings` | `/definicoes` | definições | sim |
| 60 | `shared/Receipts` | `/recibos` | recibos | sim |
| 61 | `shared/Report` | `/denunciar` | denúncia | sim |
| 62 | `shared/Blocks` | `/bloqueios` | bloqueios | sim |
| 63 | `shared/Devices` | `/definicoes/dispositivos` | dispositivos | sim |
| 64 | `shared/Notifications` | `/notificacoes` | estrutura partilhada, sobreposição com cliente | sim |
| 65 | `admin/Dashboard` | `/admin` | administração | sim |
| 66 | `admin/Users` | `/admin/utilizadores` | utilizadores | sim |
| 67 | `admin/KycQueue` | `/admin/kyc` | KYC | sim |
| 68 | `admin/ModerationQueue` | `/admin/moderacao` | moderação | sim |
| 69 | `admin/Finance` | `/admin/financeiro` | financeiro | sim |
| 70 | `admin/Compliance` | `/admin/conformidade` | conformidade | sim |
| 71 | `admin/Config` | `/admin/configuracao` | configuração | sim |
| 72 | `admin/Support` | `/admin/suporte` | suporte | sim |
| 73 | `admin/Storage` | `/admin/storage` | storage | sim |
| 74 | `admin/ProductionGate` | `/admin/producao` | gate de produção | sim |
| 75 | `system/Error` | `(sem rota no mapa original)` | estado genérico | sim |
| 76 | `system/NotFound` | `*` | 404 | sim |
| 77 | `system/Forbidden` | `/sem-permissao` | 403 | sim |
| 78 | `system/Offline` | `/offline` | offline | sim |

## Observações de alinhamento

- A página pública `/` já existia e não foi tocada.
- `creator/CreateChannel` existe no mapa de pastas do Superprompt, mas não aparece na tabela de rotas; foi criado com a rota estrutural `/estudio/conteudo/criar-canal` para manter a pasta navegável.
- `shared/Notifications` aparece na estrutura de pastas e a contagem indicada é seis, mas a tabela de rotas partilhadas não a lista; foi criada como superfície partilhada em `/notificacoes`, enquanto a rota do domínio cliente continua a ter precedência no App legado.
- `system/Error` aparece na estrutura de pastas, mas o mapa de rotas apenas define `*`, `/sem-permissao` e `/offline`; por isso a pasta foi criada sem inventar uma rota adicional.
- As páginas antigas continuam no `src/app/App.tsx`; as novas rotas são um registry separado e coexistem com o routing legado.

