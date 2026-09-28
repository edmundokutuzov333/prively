# Prively Phase 3 threat model

## Financial integrity
Threats include replayed purchase requests, concurrent bids, double releases, tampered prices and client-side amount manipulation. Mitigations are server-side RPCs, idempotency keys, row locks, server-calculated amounts, append-only ledger entries, escrow state transitions and reconciliation.

## Authorization
Threats include reading another user's ledger, private media access, creator-only actions and unauthorized LiveKit joins. Mitigations are PostgreSQL RLS, security-definer authorization functions, authenticated Edge Functions and short-lived signed URLs/tokens.

## Sensitive storage
Private media uses a non-public Storage bucket. Clients never receive a permanent object URL. The media Edge Function performs authorization first and signs the path for a short TTL.

## Live sessions
LiveKit API keys and secrets are server-side. The token function calls the database access function before creating a room token. Webhooks are signature-verified before state synchronization.

## Incentives
Points and referral payouts are disabled by default until platform settings are explicitly configured. No default points schedule or referral percentage is silently activated.

## Operational controls
Database tests cover RLS and money invariants. CI runs the application quality suite and the local Supabase pgTAP suite before merge.
