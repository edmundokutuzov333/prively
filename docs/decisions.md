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


## ADR-012: Media readiness deve ser fail-closed para derivados e Streamtape
**Contexto:** a verificação da Fase 8 encontrou uma divergência: vídeos B2 podiam ficar com `processing_status='ready'` antes de existirem thumbnail desfocada, watermark, HLS e estado `streamtape_status='ready'`, porque o caminho de vídeo de `refresh_media_processing_status()` retornava `ready` antecipadamente.
**Decisão:** remover esse fast-path e exigir, para vídeos B2, derivados server-side e Streamtape pronto antes de marcar o asset como `ready`. `get_media_access()` também passa a exigir o mesmo contrato para não-owner/admin.
**Consequência:** media incompleta fica em `processing`/`failed` e não pode ser entregue como se estivesse pronta. O worker/processor externo continua a ser um pré-requisito operacional e não é substituído por dados fabricados.


## ADR-013: Assinaturas usam contrato server-side e tiers geridos pelo owner
**Contexto:** o schema de subscrições já existia em produção, mas o RPC de compra tinha perdido o grant a `authenticated`, a UI estava limitada ao rank 1 e a renovação não expirava de forma determinística `past_due` fora da janela de 3 dias.
**Decisão:** reutilizar `subscription_tiers`/`subscriptions`, revogar DML directo do cliente, expor criação/actualização de tiers por RPC protegido ao owner do canal, manter `subscribe_to_tier` idempotente e calcular cobranças exclusivamente no servidor. A renovação diária aplica explicitamente a grace window de 3 dias e expira estados fora dela.
**Consequência:** a ausência de tiers reais deixa a UI vazia em vez de inventar dados; preços, descontos, permissões e acesso a conteúdo continuam sob controlo server-side.

## ADR-014: Migration Phase 9 inicialmente registada sem DDL deve ser preservada
**Contexto:** a primeira execução operacional da migration Phase 9 registou a versão remota sem aplicar o SQL porque o comando enviado continha apenas um comentário.
**Decisão:** não editar nem apagar essa migration aplicada. Foi criada e aplicada uma nova migration forward-only com o DDL completo.
**Consequência:** o histórico remoto mantém integridade; a migration efectiva é `phase9_subscription_levels_runtime_contract_apply`.
## ADR-015: Chat attachments stay on a separate private Storage backend
**Context:** A Fase 11 requires a private chat-media bucket separate from the platform media backend. The existing chat-attachment-upload-url Edge Function already uses the private Supabase Storage bucket prively-chat, while the certified platform media path uses Backblaze B2.
**Decision:** Keep two storage backends for now. Chat attachments remain in the private Supabase Storage bucket prively-chat. The Phase 11 privacy boundary is enforced by conversation membership, bilateral block state and locked-content/unlock rules. No migration to B2 is introduced in this phase.
**Consequence:** There are two operational storage paths to maintain, but no rewrite of a certified media path is required and private chat attachments remain isolated from the public media pipeline.
## ADR-016: Descoberta deve ser filtrada no servidor
**Contexto:** `/descobrir` precisava excluir canais de seed e owners que já não estão activos, além de permitir filtros por handle, cidade e bairro sem depender de lógica de segurança no browser.
**Decisão:** introduzir `discover_channels(...)` como RPC `SECURITY DEFINER`, com filtros server-side, exclusão explícita de `is_seed`, owner activo, canais escondidos e pares bloqueados. O cliente recebe também `follower_count` e `is_following` já calculados.
**Consequência:** a descoberta não depende de dados artificiais nem expõe canais indisponíveis para depois os esconder no cliente. A tabela `follows` deixa de aceitar DML directo por `authenticated`; seguir/deixar seguir passa pelos RPCs existentes.
