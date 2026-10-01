# RELATÓRIO — FASE 2

Funcionalidade concluída: KYC real manual com revisão protegida, fila de volume e estados de experiência.

Migrações aplicadas:
1. 20261001084134_phase2_kyc_reviewer_role_guard
2. 20261001084255_prephase_kyc_weekly_volume
3. 20261001090654_phase2_kyc_security_contract
4. 20261001090838_phase2_kyc_status_detail

RLS testada:
- kyc_verifications: leitura do próprio pedido e inserção do próprio estado pending.
- prively-kyc: bucket privado; upload do próprio utilizador e leitura administrativa/compliance.
- approve_kyc: execução removida de authenticated; exige service_role e reviewer admin/compliance.
- volume semanal: função de base não é executável por authenticated; a variante guarded é usada pelo Control Room.

Edge Functions/RPCs:
- kyc-start: ACTIVE, JWT protegido, fallback manual quando o provider não está configurado.
- kyc-submit: ACTIVE v1, JWT protegido.
- kyc-review: ACTIVE v1, JWT protegido e permissão admin.kyc.
- get_my_kyc_status: RPC protegida para estado, motivo e timestamps do próprio utilizador.
- kyc_manual_queue_weekly_volume_guarded: RPC protegida para métricas de conformidade.

Rotas/páginas:
- /admin/kyc: fila real e volume semanal.
- área de verificação: pending/review, approved, rejected com motivo, loading/error/success.

Testes correram:
- Não executado localmente nesta sessão.
- Foi adicionada supabase/tests/database/phase2_kyc_test.sql e ligada ao CI.
- SQL de produção confirmou grants, bucket privado e RPCs.

Critérios de aceitação:
- ✓ is_age_verified() permanece falso sem approved.
- ✓ approve_kyc não é executável por authenticated.
- ✓ reviewer admin/compliance é validado no servidor.
- ✓ bucket KYC é privado.
- ✓ métrica semanal calcula no máximo oito semanas e a variante guarded é protegida.
- ✓ Control Room usa dados reais e estados de UI.
- ✓ pending/review bloqueia novo envio; rejected mostra motivo.
- ✗ Teste HTTP de URL não assinada a devolver 403: UNVERIFIED.
- ✗ CI verde para o commit actual: ainda não demonstrado.

Bugs conhecidos / UNVERIFIED:
- Restore drill bloqueado sem projecto Supabase de staging.
- Projecto Vercel oficial de Prively não está verificado na conta ligada.
- Limiar N de KYC manual continua por definir no produto.
- SLA interno da fila manual continua por definir.

docs/STATE.md actualizado: sim.

Pronto para a Fase 3: não, enquanto os gates de CI e os bloqueadores operacionais definidos na secção 0 não estiverem verdes.
