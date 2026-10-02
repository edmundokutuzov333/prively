# Diagnóstico — bug de criação de canal

Data: 2026-10-02
Branch: main
Supabase: gaonupelgtpfthouyobh

## 1. Evidência de schema

A tabela `public.channels` já existia em produção.

Saída equivalente à estrutura observada no catálogo:
```
id uuid NOT NULL DEFAULT gen_random_uuid()
owner_id uuid NOT NULL
handle citext NOT NULL
display_name text NOT NULL
bio text
city text
bairro text
dm_mode text NOT NULL DEFAULT 'subscribers'
dm_price bigint
call_audio_price bigint
call_video_price bigint
created_at timestamptz NOT NULL DEFAULT now()
updated_at timestamptz NOT NULL DEFAULT now()
agency_id uuid
province text
is_seed boolean NOT NULL DEFAULT false
```

RLS está activo em `public.channels`.

## 2. Causas confirmadas

O diagnóstico histórico da falha de criação apontou quatro problemas concretos:

1. `channels` não possuía `is_seed`, portanto o modelo não distinguia dados sintéticos de canais reais.
2. Existia uma policy ampla de escrita do proprietário (`channels_owner_write`) e a policy legada `channels_read`, o que não correspondia ao contrato de criação exclusivamente por RPC.
3. O RPC devolvia erros de criação sem granularidade suficiente para a UI distinguir causas operacionais.
4. O frontend não fazia verificação server-side de disponibilidade do handle com debounce.

O utilizador não foi tratado como a causa: a criação final deve verificar no servidor o papel `creator`, KYC/idade e termos actuais.

## 3. Teste manual de produção

O proprietário do canal real `testcra` foi usado apenas para teste transaccional.

Estado server-side confirmado:
```
has_role(..., 'creator') = true
is_age_verified(...) = true
has_current_creator_terms(...) = true
```

Tentativa controlada:
```
select public.create_creator_channel('testcra','Another test channel',null);
```

Resultado real:
```
ERROR: P0001: channel_handle_taken
CONTEXT: PL/pgSQL function create_creator_channel(text,text,text) line 16 at RAISE
```

Isto confirma que o RPC actualmente diferencia correctamente a colisão de handle, em vez de devolver um erro genérico.

A verificação de privilégios também confirmou que `authenticated` não possui INSERT directo em `public.channels`.

## 4. Estado após a correcção anterior

Policies relevantes actualmente presentes:
- `channel_select_public`
- `channel_select_owner`
- `channel_update_owner`
- `channel_admin_update`
- `channel_admin_delete`

A policy legada `channels_read` está removida.

Os RPCs:
- `create_creator_channel(text,text,text)`
- `check_channel_handle(text)`

estão disponíveis para `authenticated` e não para `anon`.

## 5. Gap restante para esta Parte 3

A criação de canal já estava implementada no backend e parcialmente ligada a `/estudio/conteudo`, mas esta Parte 3 ainda não estava completa porque:
- `/estudio/perfil` continuava um shell sem leitura/edição real do canal;
- `/c/:handle` continuava um shell sem leitura real do canal;
- não existia uma suite E2E específica que provasse criar o canal e vê-lo no perfil público;
- a certificação CI da Parte 3 ainda não tinha sido executada.

## Diagnóstico final

A causa do bug histórico de criação não é a inexistência da tabela nem a ausência estrutural do papel creator. O problema foi a combinação do contrato de segurança/policies de `channels`, ausência do marcador de seed e validação de handle insuficientemente exposta à UI.

A correcção de backend existente deve ser preservada. A execução desta Parte 3 deve completar as superfícies de perfil e a prova E2E, sem recriar a fundação já aplicada.

## 5. Diagnóstico E2E da guard de workspace

A primeira certificação completa da Parte 3 (`37022560505`) executou o Playwright e falhou no primeiro controlo de `/estudio/conteudo`.

Output real:
```
P3_DEBUG creator.diagnostics_storage= {"storageUserId":"0d242d09-91dc-4358-9cd7-540ac6c77304","storageRole":"authenticated","rolesStatus":200,"rolesBody":"[{\"role\":\"client\"}, \n {\"role\":\"creator\"}]","hasRoleStatus":200,"hasRoleBody":"true"}
P3_DEBUG creator.url_after_conteudo= http://127.0.0.1:4173/estado/acesso-negado
148 passed (1.5m)
1 failed
1 skipped
```

Isto elimina a hipótese de ausência do papel `creator`: a sessão autenticada conseguia ler o papel e o RPC autoritativo `has_role()` devolvia `true`. O bloqueio estava no guard de workspace, que derivava a autorização da leitura directa de `user_roles` em vez de usar o RPC autoritativo.

Correcção aplicada em `src/app/ExperienceGuards.tsx`:
- a autorização de `/estudio/*` passa a chamar `has_role(auth.uid(),'creator')`;
- a UI deixa de inferir o papel a partir de uma leitura de tabela para esta decisão;
- KYC e Creator Terms continuam verificados separadamente.

O E2E existente permanece como regressão directa deste bug.
