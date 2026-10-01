# Prively STATE

Updated: 2026-10-01

## Fase 1
Status: IMPLEMENTED / FINAL CI GATE PENDING

The protected-role/profile foundation is present on main and applied to the production Supabase project.

Acceptance proof is tracked in:
- docs/reports/fase-1-identity-roles.md
- supabase/tests/database/phase1_identity_roles_kyc_test.sql

## Fase 2
Status: IMPLEMENTED / FINAL CI VERIFICATION PENDING

The manual KYC flow, reviewer guard, protected weekly-volume metric and protected status detail are implemented on main and the required Supabase migrations are applied to production.

Acceptance proof is tracked in:
- docs/reports/fase-2-kyc.md
- supabase/tests/database/phase2_kyc_test.sql

Open gates:
- O código da Fase 2 está implementado e o CI final está em verificação no commit actual.
- O teste HTTP local do bucket privado está coberto no CI; prova directa em produção permanece pendente porque o bucket não tem objectos reais.
- Production Vercel project remains NOT VERIFIED.
- Supabase staging project is still missing for restore drill.
