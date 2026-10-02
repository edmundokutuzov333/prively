-- A release has two ledger legs for the same source entry. Uniqueness must include the account.
drop index if exists public.ledger_release_source_unique_idx;
drop index if exists public.ledger_entries_release_source_unique_idx;
create unique index ledger_release_source_unique_account_idx
  on public.ledger_entries(release_source_id, account)
  where release_source_id is not null;
