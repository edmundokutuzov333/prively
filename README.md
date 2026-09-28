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
- pgTAP para testes SQL
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

O build Vite e os testes de qualidade são validados por GitHub Actions.

A configuração Vercel está no repositório com build npm run build, output dist e rewrite SPA. Neste momento, o conector Vercel não apresenta um projecto Prively ligado à equipa KUTUZOV, e o check Vercel mais recente foi observado como pendente/rate-limited. Portanto, não é correcto declarar um deployment de produção Vercel como 100% verificado até o projecto estar ligado e o build de produção passar no próprio Vercel.

## Dados de produção

Não foram introduzidos criadores, clientes, media ou métricas fictícias na base de dados de produção. No momento da auditoria da Fase 5, as tabelas media_uploads, media_processing_jobs e compliance_objects estavam sem registos de produção.

A especificação proíbe explicitamente dados fictícios, contadores fabricados, criadoras fictícias e funcionalidades fingidas em produção. fileciteturn0file0L737-L750

## Próxima fase

A Fase 6 começa no núcleo financeiro real: wallet, ledger append-only, partidas dobradas, idempotência, subscriptions, refunds, escrow, payouts, FX e os adaptadores reais de pagamento previstos pela especificação. O trabalho financeiro não deve começar a partir de saldos simulados.

## Validação antes de produção pública

A conclusão de código não é suficiente para abrir publicamente a plataforma. A própria especificação exige validação jurídica, termos publicados, KYC, detecção de conteúdo ilegal, equipa de moderação e suporte, criadoras verificadas e teste externo de segurança antes do lançamento público. fileciteturn0file0L543-L545
