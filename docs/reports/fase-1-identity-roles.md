# RELATÓRIO — FASE 1 — Papéis e perfis protegidos

Data: 2026-10-01
Branch: main
Supabase: gaonupelgtpfthouyobh

## Funcionalidade concluída
Fundação de identidade e autorização da Fase 1: papéis fora de profiles, proteção server-side de age_verified_at/status/self_excluded_until, helper has_role(), RLS em user_roles e integração com a camada KYC existente.

## Migrações aplicadas
Não foi aplicada uma nova migração nesta execução. O equivalente funcional da Fase 1 já está aplicado na base remota:
- 20261001080920 — phase1_identity_roles_kyc_hardening
- 20261001083223 — phase1_internal_profile_write_context

O checkout contém as versões forward-only correspondentes com timestamps locais diferentes. Não foram editadas nem apagadas migrações já aplicadas.

## Evidência de schema remoto
Verificado directamente na base:
- public.app_role existe.
- public.user_roles existe e tem RLS activo.
- public.profiles tem RLS activo.
- trigger trg_profiles_protected_fields existe em public.profiles.
- public.has_role(uuid, public.app_role) existe.
- public.has_role() é executável por authenticated.
- public.approve_kyc() não é executável por authenticated.
- public.is_age_verified() é executável por authenticated.

## RLS verificada
public.user_roles:
- roles_own_read: cada utilizador pode ler os seus próprios papéis.
- admin_manage_all: escrita administrativa condicionada por private.is_platform_admin().

public.profiles:
- profiles_own_read: leitura do próprio perfil.
- profiles_own_update: actualização apenas do próprio perfil.
- Campos sensíveis são restaurados pelo trigger antes da escrita quando a sessão não é service_role, admin, compliance ou contexto interno autorizado.

## Testes
Ficheiro: supabase/tests/database/phase1_identity_roles_kyc_test.sql

Correcções efectuadas nesta execução:
- plan(12) -> plan(18), alinhado com os 18 asserts reais.
- Corrigida uma sequência "\\n" literal que tornava inválido o SQL do assert sobre EXECUTE de approve_kyc.

O CI local da branch cria a extensão pgTAP antes de executar as suites nativas. A base de produção não tem pgTAP instalado, portanto a suite não é executada directamente em produção.

Estado do runner CI para o último commit: execução `36839605507` em andamento. Os jobs `quality` e `Edge Functions contract tests` terminaram com sucesso; o job `database` e o E2E ainda estão presos em `Start local Supabase` no runner GitHub. Não existe evidência de falha da implementação da Fase 1 nesta execução.

## Rotas/páginas alteradas
Nenhuma rota de UI foi alterada nesta fase. A Fase 1 é fundacional e não expõe nova superfície.

## Critérios de aceitação
- [✓] user_roles existe com RLS.
- [✓] has_role() existe e devolve false para papel não atribuído por contrato.
- [✓] Trigger protege age_verified_at, status e self_excluded_until.
- [✓] Escrita administrativa de roles está restrita.
- [✓] approve_kyc não está exposto a authenticated.
- [⚠] Prova pgTAP completa: preparada e incluída no CI; aguarda o runner concluir `Start local Supabase` e executar a suite.

## Bugs / UNVERIFIED
- Existe divergência de timestamp entre as migrações locais e as versões com o mesmo propósito já registadas remotamente. Não foi criada uma duplicata adicional.
- Os Security Advisors da base ainda reportam achados globais de funções SECURITY DEFINER e outros temas fora do escopo funcional desta fase.

## docs/STATE.md
Actualizado.

## Pronto para Fase 2
Não confirmado. O código da Fase 1, as migrações, RLS, trigger, funções e testes estão concluídos. A única condição pendente é a conclusão do runner CI `36839605507`, que ainda não chegou à execução do pgTAP.
