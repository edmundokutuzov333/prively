-- Reconcile local rebuilds with the production release-source uniqueness fix.
-- The legacy one-column uniqueness guard is incompatible with the two-leg release transaction.
drop index if exists public.ledger_release_source_unique_idx;
drop index if exists public.ledger_entries_release_source_unique_idx;
