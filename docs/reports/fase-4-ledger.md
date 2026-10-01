# RELATÓRIO — FASE 4

## Funcionalidade concluída

Carteira e livro-razão de partidas dobradas, append-only, com saldo derivado de lançamentos e superfície /carteira ligada ao backend real e ao Realtime.

## Diagnóstico antes da correcção

O ledger já existia em produção por migrações anteriores. A Fase 4 não deveria recriar ledger_entries nem balances.

Foram encontrados quatro pontos incompletos:
1. O RPC get_my_balances() não existia em produção, apesar de a UI depender dele.
2. balances não estava publicado em supabase_realtime.
3. A policy administrativa genérica permitia um caminho de escrita em balances, incompatível com o princípio append-only.
4. A suite inicial da Fase 4 não demonstrava uma transacção realmente equilibrada antes de validar o trigger de imutabilidade.

## Migração aplicada

- 20261001095500_phase4_ledger_runtime_contract.sql

A migração é forward-only e reutiliza as tabelas financeiras existentes.

## RLS e grants

Produção Supabase:
- authenticated não possui INSERT/UPDATE/DELETE em ledger_entries.
- authenticated não possui INSERT/UPDATE/DELETE em balances.
- leitura continua limitada ao proprietário, com leitura financeira administrativa explícita.
- admin_manage_all foi removida de balances para impedir alteração directa de saldo.
- ledger permanece append-only com trigger ledger_immutable.
- reconcile_ledger() continua a reportar 0 divergências.

## RPC

### get_my_balances()

Nova função SECURITY DEFINER, com search_path = public, pg_temp.

Retorna somente:
- wallet
- creator_pending
- creator_available

A função nunca recebe um owner_id do cliente e valida auth.uid().

Execução por authenticated: concedida.

## Realtime

public.balances foi adicionado ao supabase_realtime.

A UI subscreve somente as alterações correspondentes a owner_id=eq.<uid> e recarrega os três saldos através do RPC.

## Frontend

### /carteira

Actualizado src/pages/ClientWalletPage.tsx para:
- carregar o saldo real via get_my_balances();
- mostrar wallet, creator_pending e creator_available;
- nunca usar saldo fixo no JSX;
- mostrar estado de carregamento;
- mostrar estado de erro;
- disponibilizar recuperação com Tentar novamente;
- actualizar automaticamente por Realtime.

As etiquetas passaram para i18n em pt-MZ, en e fr.

## Testes

Actualizado:
- supabase/tests/database/phase4_ledger_test.sql

A suite agora cobre:
- tabelas e enum;
- RLS;
- ausência de grants directos de escrita;
- publicação Realtime;
- transacção equilibrada de duas partidas;
- trigger de saldo;
- leitura do próprio saldo;
- isolamento de outro utilizador;
- get_my_balances() com exactamente três contas;
- imutabilidade de UPDATE;
- imutabilidade de DELETE;
- wallet não negativo;
- reconcile_ledger() = 0.

O CI foi actualizado para executar phase4_ledger_test.sql.

## Verificação de produção executada

Confirmado no projecto Supabase real:
- get_my_balances() existe;
- execução por authenticated está autorizada;
- balances está em supabase_realtime;
- INSERT/UPDATE/DELETE directos por authenticated estão sem privilégio;
- admin_manage_all em balances foi removida;
- reconcile_ledger() devolve 0;
- nenhum lançamento foi criado pela verificação.

A execução do RPC com uma sessão simulada não foi usada como prova final porque o executor SQL desta sessão não reproduziu o contexto JWT tal como o PostgREST. A prova automatizada fica na suite local/CI.

## Testes locais/CI

Não executados nesta sessão.

Tentativa de acesso directo ao GitHub para correr a suite falhou por resolução DNS de github.com:

fatal: unable to access 'https://github.com/edmundokutuzov333/prively.git/':
Could not resolve host: github.com

Não são declarados como executados supabase db reset, supabase test db, supabase db lint --local, typecheck, lint ou build.

## Critérios de aceitação

| Critério | Estado |
|---|---|
| ledger_entries rejeita UPDATE | ✓ implementação + teste preparado |
| ledger_entries rejeita DELETE | ✓ implementação + teste preparado |
| saldo de outro utilizador isolado | ✓ RLS + teste preparado |
| /carteira usa balances/RPC | ✓ |
| wallet não negativo | ✓ constraint + teste preparado |
| Realtime de balances | ✓ produção confirmada |
| transacção equilibrada | ✓ trigger de balanceamento + teste preparado |
| reconciliação | ✓ produção = 0 |

## Bugs conhecidos / UNVERIFIED

1. A suite automática completa ainda precisa de correr num runner com acesso ao repositório.
2. A build Vercel de produção ainda não foi certificada neste ciclo.

## docs/STATE.md actualizado

Sim.

## Pronto para a Fase 5

Não para certificação formal.

Funcionalmente, a Fase 4 está implementada e o backend de produção está reconciliado. O único gate restante é executar a suite CI/local e fechar a verificação da build publicada.
