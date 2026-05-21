# Roadmap

This roadmap is for the open-source self-host template. It distinguishes the current baseline from optional future work.

## Current Baseline

Implemented:

- Single-account Cloudflare Worker.
- D1 schema and migrations.
- Signed Meta webhook verification.
- Comment keyword matching by media ID.
- Queue-backed opening, public reply, follow-gated, and final deliveries.
- Fixed 60-second queue retry delay with capped delivery attempts.
- Global `AUTOMATION_ENABLED` kill switch.
- Single-operator admin API and `/admin-ui`.
- Legal pages and Meta data deletion callback.
- Encrypted refreshed-token storage and scheduled cleanup.
- DLQ configured in the example Wrangler file.

## Near-Term Hardening

Keep this work self-host focused:

- App Review evidence: screencast, reviewer notes, tester account instructions.
- Delivery inspection and CSV export from existing delivery rows.
- Operator DLQ triage and selective replay tooling.
- Clearer setup validation for token/account ID mismatches.

## Optional Future Work

Not implemented in the template:

- Full OAuth install flow for multiple owned Instagram accounts.
- Multi-operator roles or multi-tenant billing.
- AI-assisted campaign copy generation.
- Advanced analytics beyond the operational dashboard.

Static, user-triggered delivery should remain the default App Review path even if optional features are added later.
