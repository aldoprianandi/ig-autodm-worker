# Security Best Practices Review

Review date: 2026-07-20

## Executive Summary

No confirmed critical or high-severity vulnerability was found in the reviewed Cloudflare Workers, Hono, D1, Queue, and browser-admin implementation.

The review found and remediated two security hardening gaps and two delivery-integrity/compliance issues. The remaining findings are deployment-dependent or require product decisions that should not be changed without validating real Meta account identifiers and deletion callback behavior.

## Critical Findings

None.

## High-Severity Findings

None.

## Resolved Medium-Severity Findings

### SEC-01: Admin JSON size limit was enforced after buffering

- Severity: Medium
- Status: Resolved
- Location: `src/admin/routes.ts:286-317`, `src/http/body.ts`
- Evidence: Admin JSON parsing now calls the shared streaming `readLimitedBody()` helper before decoding or parsing the request.
- Impact before remediation: A chunked unauthenticated login request without a trustworthy `Content-Length` could be buffered before the 64 KiB application limit was enforced.
- Fix: Enforce the limit while streaming and return HTTP 413 before decoding oversized content.
- Tests: Oversized and normal chunked login bodies without `Content-Length` are covered in `tests/admin.test.ts`.

### SEC-02: Terminal delivery evidence could be overwritten by duplicate queue jobs

- Severity: Medium
- Status: Resolved
- Location: `src/queue/consumer.ts:36-102`
- Evidence: Kill-switch, missing-campaign, and disabled-campaign paths now atomically claim only queued or retrying rows before marking them failed.
- Impact before remediation: A duplicate queue message processed after a delivery was already sent could replace durable sent evidence with a failure state.
- Fix: Non-claimable sent, failed, processing, or missing rows are acknowledged without mutation.
- Tests: Unit, repository, and real-D1 queue regressions cover sent-row preservation.

### SEC-03: Keyword matching could trigger messages from partial phrase matches

- Severity: Medium (messaging compliance and abuse-prevention impact)
- Status: Resolved
- Location: `src/flows/keyword.ts:3-80`
- Evidence: Multi-word keywords now require every token, exact phrases use token boundaries, and fuzzy matching rejects excessive suffix growth.
- Impact before remediation: A single word from a multi-word keyword, or a substring such as `prompted` for `PROMPT`, could trigger an opening DM and optional public reply.
- Fix: Require all multi-word tokens, use exact token windows instead of string substring matching, and retain bounded typo tolerance.
- Tests: Boundary, typo, reordered-token, and long exact-phrase cases are covered in `tests/keyword.test.ts`.

## Resolved Low-Severity Findings

### SEC-04: Turnstile verification was not bound to action and hostname

- Severity: Low
- Status: Resolved
- Location: `src/admin/ui.ts:1-11`, `src/admin/routes.ts:475-501`
- Evidence: The widget sets `data-action="admin-login"`; Siteverify responses must contain the same action and the exact request hostname.
- Impact before remediation: An overly broad Turnstile hostname configuration could weaken the optional bot barrier. Core admin credentials were still required.
- Fix: Fail closed unless HTTP status, success, action, and hostname all match.

## Residual Risks

### SEC-R01: Messaging account scope is optional

- Severity: Medium when one Meta app is subscribed to multiple Instagram accounts; otherwise Low
- Location: `src/meta/webhook.ts:25-29`, `src/meta/webhook.ts:61-67`
- Evidence: Messaging entry and recipient scoping is enforced only when `INSTAGRAM_MESSAGING_ACCOUNT_IDS` is configured.
- Impact: An authentic event for another account attached to the same Meta app could enter this single-account worker.
- Mitigation: Keep one Meta app/account per deployment. Before sharing an app across accounts, capture the real messaging identifiers, configure the allowlist, and verify it in a Meta test environment.
- False-positive note: This is not exploitable under the documented single-account, single-app deployment model.

### SEC-R02: Deleted user state may be re-created by a delayed event

- Severity: Low pending real Meta identifier validation
- Location: `src/db/repository.ts:403-416`, `src/poller/comments.ts`, `src/flows/router.ts`
- Evidence: Deletion removes event deduplication rows. A delayed webhook or recent-comment poll could later process the same interaction again.
- Impact: Recently deleted automation state could be re-created.
- Mitigation: Verify that Meta deletion callback subject IDs map to stored Instagram-scoped user IDs. If confirmed, add an HMAC-based deletion tombstone and reject events at or before the deletion time.

### SEC-R03: Token encryption has no key-version rotation path

- Severity: Low
- Location: `src/security/secret-box.ts`, `src/token/manager.ts`
- Evidence: AES-GCM encryption is sound and uses random 96-bit IVs, but stored rows do not record a key version.
- Impact: Rotating `TOKEN_ENCRYPTION_KEY` requires an operational migration or regeneration of the stored refreshed token.
- Mitigation: Continue using random high-entropy key material and document a controlled rotation procedure before adding multi-account token storage.

### SEC-R04: Retention guarantees depend on scheduled maintenance health

- Severity: Low
- Location: `src/db/repository.ts:1143-1152`, `src/ops/maintenance.ts`
- Evidence: Cleanup enforces the documented 30/90/180-day schedule through the cron path.
- Impact: A disabled or failing cron can delay deletion beyond the documented schedule.
- Mitigation: Alert on scheduled-handler failure and monitor cleanup backlog in production.

## Validated Controls

- Meta webhook HMAC verification runs over capped raw bytes before JSON parsing.
- Admin sessions use random identifiers, HMAC-only storage, HttpOnly cookies, SameSite=Strict, CSRF rotation, rate limiting, generic authentication failures, and audit logs.
- Browser UI data is rendered through safe DOM text APIs. No production `innerHTML`, `document.write`, `eval`, browser-storage session secret, or unsafe `postMessage` sink was found.
- Stored Instagram tokens use AES-GCM with random IVs and documented random key material.
- D1 access uses prepared statements with bound parameters.
- Queue sends are claimed before outbound calls; ambiguous stale sends become `send_status_unknown` and require manual reconciliation.
- Data-deletion signed requests validate HMAC, freshness, and replay claims.

## Verification

The final local validation passed TypeScript checking, infrastructure dry-run and all 15 migrations, 220 tests across 21 files, coverage thresholds, dependency audit with zero known vulnerabilities, registry-signature verification, OSS scanning, and whitespace checks. Production deployment was not performed as part of this review.
