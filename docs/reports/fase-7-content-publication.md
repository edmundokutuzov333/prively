# RELATÓRIO — FASE 7

## Funcionalidade concluída

Publicação de conteúdo com visibilidade granular, com declaração explícita de consentimento, publicação exclusivamente por RPC, agendamento server-side e ocultação de conteúdo agendado antes de publish_at.

## Migrações aplicadas

1. 20261001150000_phase7_content_publication_contract
   - cria public.content_consents com unicidade por publicação;
   - activa RLS e políticas explícitas de leitura/inserção do proprietário;
   - cria trigger imutável para a declaração de consentimento;
   - cria attest_post_content_consent(uuid,boolean);
   - exige consentimento em publish_post;
   - exige consentimento em publish_scheduled_posts;
   - remove DML directo por authenticated em posts;
   - mantém leitura de posts condicionada por posts_visible/can_view_post.

A migração foi aplicada no projecto Supabase de produção gaonupelgtpfthouyobh.

## RLS testada

| Área | Teste | Resultado |
|---|---|---|
| content_consents | RLS activo em produção | ✓ |
| content_consents | política de leitura do proprietário | ✓ |
| content_consents | política de inserção do proprietário | ✓ |
| content_consents | INSERT/UPDATE/DELETE directo de authenticated | ✓ bloqueado por privilégios de tabela |
| posts | RLS activo em produção | ✓ |
| posts | INSERT/UPDATE/DELETE directo de authenticated | ✓ bloqueado |
| posts | leitura do post agendado por outro utilizador antes de publish_at | ✓ não visível |

## Edge Functions / RPCs novas

- attest_post_content_consent(uuid,boolean) — SECURITY DEFINER, search_path=public,pg_temp, execução apenas para authenticated.
- publish_post(uuid,timestamptz) — contrato reforçado para exigir content_consents.
- publish_scheduled_posts() — contrato reforçado para ignorar posts sem consentimento.

Não foi criada Edge Function porque a operação é transaccional e pertence ao mesmo domínio SQL já usado pelo motor de publicação.

## Rotas / páginas alteradas

- /estudio/conteudo via src/pages/ContentStudioPage.tsx
  - consentimento persistido no servidor;
  - publicação imediata;
  - agendamento com datetime-local;
  - estados de erro/sucesso mantidos;
  - validação server-side continua dominante.
- i18n actualizado em src/locales/pt-MZ/common.ts, src/locales/en/common.ts e src/locales/fr/common.ts.

## Testes correram

### Prova transaccional em produção

Executada directamente contra Supabase real dentro de BEGIN ... ROLLBACK.

Resultado real:
- consentimento falso → participant_consent_required: ✓
- publicação sem consentimento → participant_consent_required: ✓
- PPV sem preço → ppv_price_required: ✓
- publicação futura fica scheduled: ✓
- outro utilizador não vê o post agendado antes de publish_at: ✓
- can_view_post nega acesso antes de publish_at: ✓
- transacção revertida sem deixar dados de teste: ✓

### Suite automatizada

Criado supabase/tests/database/phase7_content_publication_test.sql com 30 assertions.
Foi incluído no suite nativo do .github/workflows/ci.yml.

O supabase test db completo e o workflow CI final desta versão ainda não foram observados como verdes.

## Critérios de aceitação

- [✓] Post sem content_consents.participants_adult_confirmed=true não publica.
- [✓] Post scheduled não aparece para outro utilizador antes de publish_at.
- [✓] ppv sem price falha no servidor e a UI valida antes do envio.
- [✓] RLS/privileges removem DML directo de posts; leitura continua sujeita à política granular.
- [✓] Consentimento é imutável.
- [✓] Publicação agendada continua protegida no cron.
- [✓] Não existem linhas persistentes de content_consents criadas pelo teste.

## Verificação adicional

- reconcile_ledger() = 0 após a migração.
- content_consents em produção: 0 linhas fora do teste transaccional.
- prively-publish-posts: activo, * * * * *.
- Advisors Supabase continuam a reportar avisos preexistentes da plataforma; o novo RPC attest_post_content_consent aparece no aviso de SECURITY DEFINER porque precisa de ser executável pelo utilizador autenticado para gravar o consentimento no contexto da sessão.
- O advisor de performance continua a reportar o índice duplicado de ledger_entries, pertencente à hardening anterior da Fase 6.

## Bugs conhecidos / UNVERIFIED

- CI completo / supabase test db: UNVERIFIED nesta execução.
- Smoke E2E de produção: já existia falha de selector em /entrar; não é introduzida pela Fase 7.
- Bloqueador 0.6 de reconciliação de migrações continua aberto.
- Vercel production project continua não certificado como projecto efectivamente ligado ao repositório.
- Não foi criado conteúdo de demonstração em produção.

## docs/STATE.md actualizado

A actualizar no commit seguinte com o estado desta Fase 7 e os gates transversais.

## Pronto para a Fase 8

Não.

A funcionalidade da Fase 7 está implementada e a prova transaccional real passou, mas a certificação formal da fase permanece bloqueada pelo CI completo e pelos blockers transversais já documentados, sobretudo 0.6.