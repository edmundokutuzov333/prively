# RELATÓRIO — ESTRUTURA DE PÁGINAS E FICHEIROS

## 1. Resumo

A estrutura feature-based do Superprompt 1 foi criada directamente na main, coexistindo com o routing e páginas legadas existentes.
Foram criadas 78 pastas de página em src/features, cada uma com os cinco ficheiros exigidos.
O registry lazy foi centralizado em src/app/routes.tsx e os caminhos em src/lib/routes.ts.
Os ficheiros de i18n têm 256 chaves folha em pt-MZ, en e fr, com paridade confirmada.
Typecheck, lint, testes unitários, build, auditoria de produção, Edge Functions contract tests e database CI ficaram verdes na run 36979532340.
A mesma run ficou vermelha apenas no E2E KYC existente: A.3.14 KYC_not_found, com 145 testes E2E passados, 1 falhado e 1 ignorado.
O gate de estrutura foi posteriormente endurecido no commit 31fd983321df41bc2ba51cdc8573f7099ee0b184 para falhar de facto perante ficheiros, i18n, rotas ou copy proibido em falta.
A nova CI da main para esse endurecimento é a run 36980524836 e estava pendente no momento deste relatório.
Por isso, a aceitação global permanece condicionada pela validação da nova CI e pelo E2E KYC.

## 2. Commits / marcos

O Superprompt pede 10 commits de domínio/fase. A implementação real na main contém mais commits porque houve correcções iterativas e alguns ficheiros foram criados através da API de conteúdos do GitHub.

1. 4c7cc3506f90a3c482391020fa606792cd3e57c0 — estrutura: fundacao: validar mapa central de rotas
2. d59f76a69e0e930ef9684dc6801ff36b0e02a063 — estrutura: public: paginas publicas e registo central
3. 5dc6e7a7047f867888e655bebd73909d340d4160 — estrutura: auth: onboarding e paginas de autenticacao
4. f876750baf2f799ddaa01b4136ff382b2f1cf21f — estrutura: client: paginas da experiencia cliente
5. 94bf2c2829c699b3a5f0d78c2585e5d3af61d151 — estrutura: creator: paginas da experiencia criadora
6. 09ee55913bd3130b99d49369cfdd65628c24ca37 — estrutura: shared: superficies partilhadas
7. 2c1f4a44466a74027c31a8e669d374a82fcb100e — estrutura: admin: paginas do control room
8. e0adeffa079f7924062d18bf07d998272a3da6b4 — estrutura: system: registar estados e catch-all
9. c445adffddd2d4ec38bb80735ff659422a03a0de — estrutura: ci: validar contrato das paginas
10. 3cb05d05fa5edf166d3f5d23d029bb94d5e719ae — estrutura: docs: ADR coexistencia feature based

Hardening adicional: 31fd983321df41bc2ba51cdc8573f7099ee0b184 — estrutura: tests: tornar gate de paginas executavel.

Além destes marcos, houve correcções necessárias de TypeScript, lint, router de testes, paridade i18n, normalização das constantes e ajustes do shell.

## 3. Evidências

check:page-structure na run 36979532340: executou sem falha. O gate foi posteriormente endurecido no commit 31fd9833; a nova execução estava pendente na run 36980524836.

npm run typecheck na run 36979532340: passou.
npm run lint na run 36979532340: passou.
npm run test na run 36979532340: passou. 84 ficheiros de teste, 94 testes.
npm run audit:production na run 36979532340: passou. 403 browser files e 48 Edge Function files inspeccionados.
npm run build na run 36979532340: passou.
Edge Functions contract tests na run 36979532340: passou.
Database CI na run 36979532340: passou, incluindo reset, lint, KYC bucket, suite canónica e regressões SQL.

CI 36979532340:
Quality: success.
Edge Functions: success.
Database: success.
E2E: failure.
E2E: 145 passed, 1 failed, 1 skipped.
Falha exacta: tests/e2e/journey-client-a2-a3.spec.ts em A.3.14 KYC_not_found.
O log mostra A.3.13 AAL1 com HTTP 403 e A.3.13 AAL2 com HTTP 200, mas a leitura KYC subsequente não encontrou o registo após cinco tentativas.

CI 36980524836:
Estado no momento do relatório: pending.
Motivo: validação do novo gate estrutural endurecido no commit 31fd9833.

## 4. Mapa de páginas criadas

Mapa completo entregue em docs/pages-map.md.
public: 8
auth: 7
client: 21
creator: 22
shared: 6
admin: 10
system: 4
Total: 78.
Cada página contém index.ts, componente .tsx, .types.ts, .test.tsx e README.md.

## 5. Guards implementados

Age Gate: /registar passa por ProtectedAgeGate.
Auth: onboarding cliente passa por AuthenticatedFeatureGuard.
KYC e role: áreas cliente e criadora passam pelo ExperienceGuard existente, que centraliza autenticação, estado da conta, KYC e role.
MFA/admin: /admin/* passa por AdminGuard, reutilizando o gate existente de papel administrativo e AAL2.
Os guards existentes foram reutilizados; não foram duplicados no backend.

## 6. i18n

Ficheiros: src/lib/i18n/pt-MZ.json, src/lib/i18n/en.json, src/lib/i18n/fr.json.
Contagem: pt-MZ 256, en 256, fr 256.
Paridade: 0 chaves em falta ou excedentes entre qualquer par.

## 7. O que NÃO foi feito

Não foi implementado backend novo, migrações novas, RPCs, Edge Functions, integrações externas ou lógica de negócio, conforme o âmbito do Superprompt 1.
Não foi feita a migração destrutiva das páginas legadas.
Não foi corrigido A.3.14 KYC_not_found, porque a correcção exigiria entrar no backend ou fluxo KYC, fora do âmbito deste Superprompt.

Há três inconsistências no próprio Superprompt e foram tratadas explicitamente:
CreateChannel existe na estrutura de pastas, mas não tem rota na tabela; foi criada uma rota estrutural explícita para manter a pasta navegável.
shared/Notifications aparece na estrutura e na contagem de seis páginas, mas não aparece na tabela de rotas; a superfície existe em /notificacoes e a rota cliente permanece a ter precedência no App legado.
system/Error aparece na estrutura de pastas, mas não tem rota no mapa; a pasta foi criada sem inventar uma rota.

## 8. Pronto para o Superprompt 2

Não.
A espinha dorsal de páginas, ficheiros, rotas, i18n, guards, testes unitários, build e auditoria está pronta.
A aceitação global não está verde até a nova CI do commit 31fd9833 fechar e, principalmente, enquanto o E2E KYC A.3.14 continuar vermelho.
O Superprompt 2 não deve ser tratado como oficialmente desbloqueado enquanto esse critério continuar vermelho.
