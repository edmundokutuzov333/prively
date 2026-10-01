# RELATÓRIO — FASE 11

Funcionalidade concluída: Chat em tempo real com regras de DM, bloqueio e privacidade

## Implementação

A Fase 11 foi fechada como hardening forward-only sobre o sistema de comunicação já existente. Não foram recriadas as tabelas de chat da especificação antiga, porque a produção já tinha o contrato de comunicação da Fase 7 com conversas, membros, mensagens, anexos, conteúdo bloqueado, unlocks, Realtime e bucket privado.

Migração aplicada em produção:
- supabase/migrations/20261001164200_phase11_chat_privacy_runtime_contract.sql
- Supabase migration name: phase11_chat_privacy_runtime_contract
- Aplicação remota: SUCCESS

Alterações principais:
- blocks passou a ter apenas a política privada blocks_owner_all para authenticated.
- messages_member passou a exigir simultaneamente membership e ausência de bloqueio bilateral.
- message_attachments_member_read passou a herdar a mesma fronteira de privacidade.
- locked_content_member_read passou a herdar a mesma fronteira de privacidade.
- create_conversation(uuid) passou a verificar idade, proprietário activo, auto-conversa, bloqueio bilateral, dm_mode=off e subscrição quando dm_mode=subscribers.
- send_message(uuid,text) legado deixou de estar executável por authenticated.
- send_message_v2 e send_message_guarded continuam como caminhos de envio protegidos.
- ADR-015 registado para manter chat em Supabase Storage privado separado do media B2.

## RLS testada

| Tabela | Teste | Resultado |
|---|---|---|
| blocks | RLS activo, política de proprietário e remoção de políticas administrativas genéricas | PASS |
| messages | membership + bloqueio bilateral na política SELECT | PASS |
| message_attachments | membership + bloqueio bilateral + ownership/unlock | PASS |
| message_locked_content | membership + bloqueio bilateral + sender/unlock | PASS |
| conversations | create_conversation protegido por regras de DM/bloqueio | PASS |
| Realtime messages | public.messages incluída em supabase_realtime | PASS |

Verificação directa remota após a migração:
- privacy_policies relevantes: 3
- realtime_messages: 1
- private_chat_bucket: 1
- send_message_guarded para authenticated: true
- send_message_v2 para authenticated: true
- send_message legado para authenticated: false

## RPC / Edge Functions

RPCs:
- create_conversation(uuid): hardenizado e activo em produção.
- send_message(uuid,text): caminho legado revogado para authenticated.
- send_message_v2(...): activo e protegido.
- send_message_guarded(...): activo e protegido.

Edge Functions:
- chat-attachment-upload-url: ACTIVE v33, JWT obrigatório.
- chat-attachment-url: ACTIVE v34, JWT obrigatório.

Não foi criada uma Edge Function nova na Fase 11 porque a função de upload privado já existia e está operacional.

## Frontend

Rotas/páginas alteradas: nenhuma.

A superfície de chat existente já satisfazia o contrato funcional da Fase 11:
- o ecrã de conversa mostra o aviso de privacidade;
- o envio usa send_message_guarded;
- useMessages usa Supabase Realtime Postgres Changes filtrado por conversation_id;
- anexos usam o bucket privado prively-chat.

Não foi introduzida uma segunda implementação de chat.

## Testes executados

Executado contra o projecto Supabase de produção:
- verificação estrutural de RLS, grants, publicação Realtime e bucket privado: PASS.
- prova transaccional de bloqueio: PASS. O send_message_guarded foi recusado depois de criado o bloqueio bilateral e não criou uma mensagem nova. A transacção de prova terminou com rollback.
- verificação do caminho de privacidade: send_message_v2 está protegido por assert_communication_privacy e o fluxo usa a aceitação de privacidade existente.

Suite versionada:
- supabase/tests/database/phase11_chat_privacy_test.sql
- suite tornada auto-contida com utilizadores de teste temporários e rollback.
- incluída no CI canónico e na suite native de .github/workflows/ci.yml.

Não executado nesta sessão:
- execução integral do GitHub Actions CI do commit final. O wrapper GitHub ligado nesta sessão expõe runs associados a pull requests, enquanto estes commits foram feitos directamente na main; o combined status devolveu lista vazia.
- E2E de duas sessões WebSocket reais no browser. A segurança de entrega está no RLS de messages + publicação Realtime, e o caminho frontend foi verificado no código.

## Critérios de aceitação

- [✓] Utilizador bloqueado não insere mensagens via RPC directa.
- [✓] Realtime tem a mensagem protegida por RLS de participante e a tabela messages está na publicação supabase_realtime.
- [✓] Aviso de privacidade existe no ecrã de chat.
- [✓] ADR sobre anexos registado como ADR-015.

## Bugs conhecidos / UNVERIFIED

- CI final do commit 03c52c07edb625d20bf6f79ea6a2b3199f953a55 ainda não tem estado observável no conector GitHub desta sessão.
- E2E WebSocket real com dois utilizadores autenticados não foi executado.
- Os Supabase Advisors continuam a apresentar warnings globais preexistentes fora do perímetro da Fase 11. Para as tabelas directamente endurecidas nesta fase não foi encontrado finding relevante nos advisors.
- Os bloqueadores transversais 0.6, 0.7, Vercel e a certificação final da Fase 8 continuam definidos pelo estado anterior da plataforma.

docs/STATE.md actualizado: sim

Pronto para a Fase 12: não.

Razão: a implementação da Fase 11 está aplicada e o contrato de segurança está fechado, mas o CI final e o E2E WebSocket de duas sessões ainda não têm evidência executada nesta sessão.