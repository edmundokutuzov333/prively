# RELATÓRIO — FASE 3 — CANAL DA CRIADORA END-TO-END

Data: 2026-10-02
Branch: main
Supabase: gaonupelgtpfthouyobh

## 1. Estado

A implementação da Fase 3 está concluída no código e no Supabase.
A certificação final permanece pendente exclusivamente do CI desta versão final e do output E2E correspondente.

## 2. Diagnóstico

Diagnóstico detalhado: docs/reports/channel-bug.md.

A produção já tinha public.channels e public.create_creator_channel(text,text,text).
As causas confirmadas no histórico do bug foram:
- falta de is_seed;
- policy ampla channels_owner_write;
- policy legada channels_read;
- erros de criação insuficientemente específicos para a UI;
- ausência de disponibilidade server-side do handle no fluxo inicial.

A reprodução manual live confirmou a protecção de colisão de handle:
ERROR: P0001: channel_handle_taken
CONTEXT: PL/pgSQL function create_creator_channel(text,text,text) line 16 at RAISE

A verificação live confirmou para o owner de teste:
has_role(...,'creator') = true
is_age_verified(...) = true
has_current_creator_terms(...) = true

## 3. Backend

O contrato de criação existente foi preservado:
- create_creator_channel(text,text,text) continua a ser a única via de criação autenticada.
- check_channel_handle(text) mantém disponibilidade server-side.
- channels.is_seed permanece aplicado.
- INSERT directo por authenticated permanece proibido.
- seeds permanecem excluídos da leitura pública.

Foram adicionadas três migrações forward-only:
- 20261002143000_phase3_creator_channel_profile_rpc
- 20261002143500_phase3_channel_profile_dml_hardening
- 20261002144000_phase3_channel_owner_index

update_creator_channel(uuid,text,text,text,text,text,text):
- exige sessão;
- exige papel creator;
- valida handle, nome e bio;
- impede colisão de handle;
- impede edição de canal de outro owner;
- recusa seed;
- escreve channel.updated em security_events.

A escrita directa de channels por authenticated foi revogada:
has_table_privilege('authenticated','public.channels','UPDATE') = false

O RPC de perfil ficou:
authenticated EXECUTE = true
anon EXECUTE = false

Foi adicionado channels_owner_id_idx porque o fluxo de /estudio/perfil consulta o canal por owner_id.

## 4. Frontend

### /estudio/conteudo

Mantém a implementação real existente:
- criação através de create_creator_channel;
- disponibilidade de handle através de check_channel_handle;
- debounce de 400 ms;
- mensagens específicas por erro;
- dados do canal recarregados do backend.

### /estudio/perfil

Deixou de ser shell.
Agora:
- lê o canal real do owner;
- apresenta loading, empty, error, offline, forbidden e success;
- edita handle, nome, bio, cidade, bairro e província;
- grava exclusivamente através de update_creator_channel;
- permite abrir o perfil público pelo handle real.

### /c/:handle

Deixou de ser shell.
Agora:
- lê channels pelo handle através do cliente autenticado;
- fica sujeito ao RLS de channels;
- mostra nome público, handle, bio e localização;
- não expõe seeds;
- trata loading, empty, error, offline, forbidden e success.

i18n actualizado em:
- src/locales/pt-MZ/common.ts
- src/locales/en/common.ts
- src/locales/fr/common.ts

## 5. Testes SQL

Suite nova:
supabase/tests/database/phase3_channel_profile_test.sql

Inclui 21 assertions:
- RPC existe;
- authenticated pode executar;
- anon não pode executar;
- UPDATE directo bloqueado;
- guards channel_forbidden e channel_handle_taken;
- criação de canal real;
- edição do próprio canal;
- persistência de nome, bio e localização;
- colisão de handle;
- tentativa de editar canal de outro creator;
- visibilidade pública;
- seed invisível;
- auditoria channel.updated.

Suites existentes mantidas:
- phase3_channel_creation_test.sql
- phase3_channel_seed_visibility_test.sql

Estas suites foram adicionadas ao canonical database suite e ao conjunto native SQL do CI.

## 6. Teste transaccional live

Foi executado no Supabase real um update transaccional do canal existente:
handle=testcra
display_name=Carla Julia Updated
bio=Phase 3 profile transaction
city=Maputo
bairro=KaMpfumo
province=Maputo

A transacção foi revertida depois da confirmação.

## 7. E2E

Nova suite:
tests/e2e/phase3-channel.spec.ts

Fluxo:
1. cria creator real de teste com KYC aprovado, role creator e Creator Terms;
2. entra pelo /entrar;
3. cria canal em /estudio/conteudo;
4. edita o canal em /estudio/perfil;
5. abre /c/<handle>;
6. cria cliente real separado;
7. cliente abre o mesmo /c/<handle>;
8. confirma nome, bio e localização;
9. confirma eventos de channel.created e channel.updated.

Output E2E final: pendente do CI desta versão final.

## 8. CI

O workflow ficou sujeito a cancelamentos por novos commits sucessivos durante a implementação.
CI definitivo da versão final: pendente.
Production Smoke da versão final: pendente.

Production Delivery continua independente do gate técnico e pode falhar quando os secrets de produção estão ausentes. Isso não altera os jobs de Prively CI.

## 9. Auditoria

Os advisors Supabase continuam a reportar avisos gerais do projecto, incluindo várias funções SECURITY DEFINER já existentes e extensões instaladas em public. Não foram introduzidos grants anónimos para o novo RPC de perfil.

O novo update_creator_channel é SECURITY DEFINER, usa set search_path = '' e executa apenas com authenticated.

## 10. Gate

Parte 3: implementação pronta para certificação.

Parte 4: não iniciada.

A execução deve parar até o CI final desta versão ficar verde.
