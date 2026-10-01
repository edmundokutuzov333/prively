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

## ADR-009: Limiar de KYC manual
**Contexto:** o adaptador KYC real suporta modo manual e não existe validação escrita de fornecedor externo nesta auditoria.
**Decisão:** manter revisão manual enquanto o volume semanal for menor ou igual a 100 pedidos. Acima de 100, não existe promoção automática. A activação de um fornecedor externo exige confirmação humana de compatibilidade com o enquadramento da Prively.
**Consequência:** o volume semanal real é medido por `kyc_manual_queue_weekly_volume_guarded()`. O limiar é operacional e interno.

## ADR-011: SLA interno da fila KYC
**Contexto:** a especificação exige um SLA interno mesmo quando ele não é comunicado ao utilizador.
**Decisão:** adoptar alvo interno de 24 horas úteis para tratamento da fila manual.
**Consequência:** os estados pending/review continuam sem apresentar tempo estimado ao utilizador.

## ADR-010: Seed de canal deve ser marcado e filtrado, não inserido em produção
**Contexto:** a criação de canal exige um creator válido e a UI precisa de não expor dados artificiais em `/descobrir` nem em listagens públicas. O seed pode ser útil em desenvolvimento, mas não deve aparecer como conteúdo real.  
**Decisão:** usar `is_seed = true` para qualquer registo estritamente de desenvolvimento, e excluir esses registos de queries públicas/descoberta por `WHERE is_seed = false` ou equivalente. Evitamos criar filas de seed em produção e evitamos remover dados sem necessidade.  
**Consequência:** o desenvolvimento continua com fixtures úteis, mas utilizadores reais não veem canais de seed no feed público e não há risco de contaminar a produção com dados fictícios.


## Fase 8 — registo de verificação de media

**Estado:** PARCIALMENTE VERIFICADO.

**Backend efectivo observado:** os assets de produção não apagados usam `storage_provider='backblaze_b2'`, com `metadata.media_backend='b2'` e bucket `prively-media-originals-2026`. Isto confirma o backend efectivo observado no pipeline, mas não substitui a leitura directa de `supabase secrets list`.

**CORS B2:** a configuração normativa está documentada em `docs/b2-cors.md`. A aplicação efectiva no bucket não foi declarada como confirmada porque não existe acesso verificável ao painel/API administrativo do Backblaze nesta sessão.

**Staging/Streamtape:** não existe actualmente um projecto Supabase de staging disponível para executar a transição de um vídeo novo. A validação histórica do pipeline não é usada como substituto de um teste novo em staging.

**Regra:** não alterar os componentes certificados de media apenas para preencher evidências externas em falta.
