# ADRs da Auditoria Prively

## ADR-001: Não fazer deploy durante a auditoria
**Contexto:** o mandato exige aprovação humana antes de qualquer deployment de produção.  
**Decisão:** nenhuma alteração persistente foi aplicada via Supabase e nenhum deploy Vercel foi iniciado.  
**Consequência:** alguns estados permanecem PARCIAL até CI e staging confirmarem as correcções.

## ADR-002: Correcções forward-only
**Contexto:** não é permitido alterar migrações já aplicadas.  
**Decisão:** todo hardening foi criado em novas migrações com timestamp posterior.  
**Consequência:** é necessário reconciliar os 175 ficheiros locais com as 123 versões remotas antes de aplicar a sequência.

## ADR-003: Fail-closed para tabelas públicas sem policy
**Contexto:** RLS activo sem policy pode deixar a intenção de acesso ambígua.  
**Decisão:** a migração nova cria uma policy `USING(false)` / `WITH CHECK(false)` quando uma tabela pública não tem policy.  
**Consequência:** uma tabela sem contracto explícito fica negada por defeito.

## ADR-004: search_path seguro em SECURITY DEFINER
**Contexto:** funções SECURITY DEFINER com `search_path=public` não satisfazem o hardening exigido.  
**Decisão:** normalizar para `public, pg_temp`.  
**Consequência:** menor superfície de resolução insegura de objectos.

## ADR-005: AAL2 no compliance
**Contexto:** `phase8_can_compliance_read` verificava apenas papel.  
**Decisão:** acesso de compliance e administração sensível exige `auth.jwt()->>'aal'='aal2'`.  
**Consequência:** sessão AAL1 deixa de ser suficiente para o perímetro de compliance.

## ADR-006: E2E deve usar configuração real não secreta
**Contexto:** o cliente Supabase requer URL e publishable key no browser.  
**Decisão:** injectar estes valores no job E2E.  
**Consequência:** elimina falha de bootstrap sem expor SERVICE_ROLE.

## ADR-007: Vercel rate limit é blocker, não deve ser contornado
**Contexto:** os checks Vercel devolvem `Deployment rate limited - retry in 24 hours`.  
**Decisão:** não criar deploy alternativo nem contornar o provider durante esta sessão.  
**Consequência:** verificação final do frontend permanece pendente.

## ADR-008: Integrações externas não são simuladas
**Contexto:** não existe evidência sandbox para todos os fornecedores.  
**Decisão:** estados ficam NÃO VERIFICADO, REAL·FLAG ou BLOQUEADO·EXTERNO conforme a evidência disponível.  
**Consequência:** nenhuma credencial fictícia ou fixture externa é usada para declarar sucesso.
