# Prively threat model baseline

Phase 1 establishes the interface and client boundary only. The authoritative controls for identity, age verification, roles, content access and money are intentionally deferred to the backend phases.

Current client-side guarantees:

- no simulated authentication success
- no production content or financial data
- validation with Zod on auth forms
- explicit configuration failure when Supabase is unavailable
- dark-mode-only surface consistent with the product specification
- reduced-motion handling

Backend security requirements remain mandatory before any adult content, wallet, transaction or sensitive admin feature is exposed in production.
