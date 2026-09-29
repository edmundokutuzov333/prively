# Production Security Exceptions

This file records advisor findings that are intentionally not represented as launch blockers.

## SECURITY DEFINER RPCs

Prively uses SECURITY DEFINER for server-side domain boundaries where the browser must request a controlled mutation or read without receiving direct table access. Examples include financial operations, content authorization, moderation, safety, business transactions and creator tools.

These functions are required by the architecture in the definitive specification. The hardening requirement is not that every SECURITY DEFINER disappears; it is that they use a fixed search_path, validate auth.uid() and role/ownership, and keep internal helpers non-executable by client roles.

Phase 10 verified that public SECURITY DEFINER functions have an explicit search_path. Internal helpers are revoked from anon/authenticated where they are not client contracts.

## Multiple permissive RLS policies

The remaining multiple_permissive_policies warnings come mainly from the historical Control Room model where an admin policy coexists with a domain policy on the same table. Removing these policies blindly would remove legitimate Control Room access.

Sensitive private surfaces were hardened separately in Fases 7 to 10. The phase10 native regression suite verifies that every public table has RLS, every public table has explicit policy coverage, and sensitive media/financial contracts remain server-side.

The remaining debt should be reduced by a future RBAC policy consolidation migration that merges equivalent admin and domain predicates without changing access semantics.

## Extension in public

citext remains in public because the domain model uses citext columns and the current schema/migrations depend on that namespace. Moving it requires a coordinated type/schema migration and regression across existing columns.

## Leaked password protection

The Supabase Auth advisor reports leaked password protection as disabled. This is an external Supabase Auth configuration item and is intentionally left as a launch blocker rather than falsely represented as solved in repository code.

## Performance informational findings

Unindexed foreign keys and unused indexes are tracked separately from security blockers. Some indexes belong to newly introduced domains with little or no production traffic. Removing them prematurely can regress the intended access paths.

The production gate therefore requires the security-critical checks to pass while keeping external and performance maintenance visible in the Control Room and README.
