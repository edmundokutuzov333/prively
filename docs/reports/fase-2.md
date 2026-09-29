# RELATÓRIO FASE 2 — Identidade, acesso e KYC

## 1. Resumo executivo (máx. 8 linhas, linguagem simples, sem jargão)

A autenticação deixou de aceitar confirmações automáticas de email.
O cadastro só aceita os papéis públicos cliente e criadora; papéis internos não entram pelo formulário.
Aceites legais e termos de criadora passam a ser registados no servidor.
Foi acrescentado o fluxo de KYC com webhook assinado e resultado idempotente.
O PIN discreto usa seis dígitos, salt e PBKDF2, com bloqueio progressivo e limpeza após tentativas excessivas.
O fornecedor KYC continua desligado até existirem credenciais e validação contratual.

## 2. Commits e tag

- `de6ed83` — `fase-2: auth: remove email bypass and harden identity`
- `036172c` — `fase-2: tests: assert email auto-confirm is absent`
- Tag local: `fase-2-concluida`
- Publicação remota: pendente de atualização autenticada da `main`; não foi usado force push.

## 3. Evidências (colar output REAL, truncado se enorme)

- `npm run typecheck` — passou.
- `npm run lint` — 0 erros; 1 aviso pré-existente em `src/app/session.tsx`.
- `npm test -- --run` — 5 ficheiros, 14 testes aprovados.
- `npm run audit:production` — `Production audit passed: 76 browser files and 35 Edge Function files inspected.`
- `npm audit --omit=dev --audit-level=high` — `found 0 vulnerabilities`.
- `npm run build` — `✓ built`; PWA gerada com 17 ficheiros precache.
- `supabase db reset` / `supabase test db` — não executados neste ambiente; CLI local e suite remota não foram disponibilizados para esta execução.
- Playwright / k6 — não executados nesta fase.

## 4. Critérios de aceitação da fase — cada um ✅ / ❌ / ⚠️ com a evidência

- ✅ Sem auto-confirmação no código: migração `20260930120000_phase2_identity_auth_hardening.sql` remove o trigger de auto-confirm.
- ✅ Papéis de signup limitados a cliente/criadora no trigger `handle_new_user`; papéis internos não são aceites pelo formulário.
- ✅ Aceites legais e termos de criadora são persistidos pelo trigger.
- ✅ PIN discreto v2 com PBKDF2, comparação constante, bloqueio progressivo, limpeza e migração do formato legado; 4 testes dedicados aprovados.
- ✅ KYC tem início, webhook HMAC, validação de idade/documento e aplicação idempotente no servidor.
- ⚠️ KYC real não está ligado: faltam fornecedor, segredo e contrato de retenção; a UI fica em modo manual, sem aprovação simulada.
- ⚠️ A migração ainda não foi aplicada ao Supabase remoto nesta execução; a aplicação remota não é declarada concluída.

## 5. Estado da plataforma (scoreboard)

| Módulo | Estado (REAL / REAL·FLAG / BLOQUEADO·EXTERNO / PARCIAL / NÃO INICIADO / NÃO VERIFICADO) | Evidência | % |
|---|---|---|---:|
| Contas | PARCIAL | Auth endurecida no código; aplicação remota pendente | 75 |
| Age/KYC | BLOQUEADO·EXTERNO | Edge Functions e RPC prontos; fornecedor/credenciais em falta | 50 |
| Perfis | PARCIAL | Handle e papéis endurecidos por migração | 60 |
| PWA/Discreto | PARCIAL | PIN v2 e testes locais | 65 |
| Conformidade/Arquivo | PARCIAL | Aceites legais registados; retenção KYC externa pendente | 55 |
| CI/CD | PARCIAL | Checks locais verdes; publicação/CI remoto pendentes | 65 |

## 6. Achados F-xx: resolvidos / adiados (com motivo) / novos achados N-xx

- F-03 — adiado: o pipeline remoto ainda exige publicação autenticada e verificação CI antes de produção.
- F-05 — resolvido no código: auto-confirmação e escalada de papéis foram removidas da migração.
- F-06 — parcial: KYC tem contrato servidor-servidor, mas o fornecedor ainda não foi escolhido/configurado.
- N-02 — novo: a migração precisa de correr no projecto remoto antes de validar os triggers em produção.

## 7. UI · UX · CX · SD — o que melhorou nesta fase (1 linha por lente)

- UI: PIN de seis dígitos e estados de erro/bloqueio continuam compatíveis com os componentes existentes.
- UX: confirmação de email e bloqueio progressivo têm mensagens claras e sem aprovação silenciosa.
- CX: KYC sem fornecedor mostra estado manual, sem prometer uma verificação inexistente.
- SD: aceites, resultados KYC e eventos de segurança ficam registados para suporte e conformidade.

## 8. Riscos e dívida técnica (honesto)

O Supabase remoto ainda contém contas de teste e o trigger antigo até a migração ser aplicada; não foram apagados sem autorização explícita. O KYC necessita de fornecedor aprovado, política de retenção e segredos. A configuração de email, SMTP, CAPTCHA e limites de abuso precisa de validação no painel Supabase. Ainda falta E2E de dois utilizadores para provar isolamento de sessão e permissões.

## 9. Pedidos ao Dono do Produto (credenciais, decisões, pareceres) — com prazo sugerido

- Escolher fornecedor KYC e fornecer credenciais sandbox, contrato de webhook e política de retenção — antes da ativação da Fase 2 em produção.
- Autorizar remoção das três contas `*.teste@prively.test` do projecto remoto, ou confirmar que ficam confinadas a staging — antes do primeiro ensaio real.
- Confirmar SMTP/domínio e política de CAPTCHA/rate limiting — antes do lançamento público.

## 10. Plano da próxima fase (5–10 linhas)

Aplicar a migração em staging e correr reset/testes SQL.
Validar o worker de media com storage privado e scan real.
Fechar o contrato de estados de processamento e URLs assinados.
Adicionar E2E de upload, scan, publicação, rejeição e expiração.
Manter publicação bloqueada até o pipeline confirmar o estado seguro.
