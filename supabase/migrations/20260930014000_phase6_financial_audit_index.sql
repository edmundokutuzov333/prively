-- Cross-phase performance repair discovered during Phase 8 regression.
create index if not exists financial_audit_log_actor_idx on public.financial_audit_log(actor_id,created_at desc);
