-- Keep each due earnings source uniquely releasable per ledger account.
-- The production database already contains this constraint; this file reconciles
-- the repository history with the live migration ledger.
create unique index if not exists ledger_release_source_unique_account_idx
  on public.ledger_entries (release_source_id, account)
  where release_source_id is not null;
