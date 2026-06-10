# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Open-source, single-account Instagram comment-to-DM automation template on Cloudflare Workers (Hono + D1 + Queues), using only the official Meta Instagram Graph API. A user comments a keyword on a configured post; the Worker sends an opening private reply with a button, optionally walks the user through up to 3 button steps and a follow gate, then delivers a final prompt/link. `AGENTS.md` is the canonical operational guide and its rules apply to Claude Code too.

This is the public template; it must stay free of any operator-specific branding, account IDs, campaign keywords, or deployment facts. `npm run scan:oss` enforces this and runs in CI — keep it passing.

## Commands

```bash
npm run dev                 # wrangler dev (requires copying wrangler.example.toml to wrangler.toml)
npm run typecheck           # tsc --noEmit (TypeScript 6)
npm test                    # vitest run (all tests)
npm test -- tests/admin.test.ts        # single test file
npm test -- -t "verify token"          # filter by test name
npm run test:coverage       # vitest with v8 coverage (thresholds 85/75/85/85)
npm run scan:oss            # forbidden-path and secret-pattern scan for the public repo
npm run db:migrate:local    # apply D1 migrations locally
npm run infra:validate      # dry-run deploy against wrangler.example.toml + example migration check
```

Before claiming any change is ready, run the verification flow from `AGENTS.md`: `typecheck`, `test`, `infra:validate`, `test:coverage`, `scan:oss`, `npm audit --json`, `npm audit signatures`, `git diff --check`.

`wrangler.toml` is gitignored here — operators copy `wrangler.example.toml` and fill their own IDs. Local secrets go in `.dev.vars` (gitignored, never print or commit).

## Architecture

`src/index.ts` exports one Worker with three entrypoints:

1. **`fetch`** — Hono app: public legal pages, `GET/POST /webhooks/meta`, Meta data-deletion callback, `/admin-ui` shell, and `/admin/*` API (`src/admin/routes.ts`).
2. **`queue`** — `processDeliveryBatch` (`src/queue/consumer.ts`) consumes `DELIVERY_QUEUE` jobs and calls the Meta API.
3. **`scheduled`** — every-minute cron: comment poller (`src/poller/comments.ts`), stale-delivery recovery (`src/queue/recovery.ts`), cleanup + token refresh (`src/ops/maintenance.ts`, `src/token/manager.ts`).

### Event pipeline (the core flow)

Comments reach the system two redundant ways: HMAC-verified webhook POSTs and the cron poller (for missed webhooks). Both normalize into `NormalizedEvent`s and funnel through `FlowRouter.handleEvent` (`src/flows/router.ts`), which:

- dedupes via `webhook_events` (`event_id` PK + `INSERT OR IGNORE`),
- matches a campaign by media ID + fuzzy keyword (`src/flows/keyword.ts`, Damerau-Levenshtein with Indonesian stop-words),
- creates a `deliveries` row and enqueues a `DeliveryJob`.

**Idempotency is the load-bearing design**: delivery IDs are deterministic (`${campaignId}:${igUserId}:${type}`) with a UNIQUE constraint, so webhook + poller + recovery can all race safely — `createDelivery` returning `false` means someone else already did it. The consumer additionally claims rows by flipping status to `processing` before sending (`claimDeliveryForSend`), retries up to 5 attempts with retryable-vs-permanent Meta error classification (`src/meta/api.ts`), wraps every Meta call in `runRetryableMetaCall` so thrown network errors mark the row retrying instead of crashing the batch, and a local D1 outbound rate limiter gates every send.

### Contact state machine

`contact_states` tracks per-(campaign, user) progress: `commented` → optional `button_step:N` → `confirmed` or `follow_requested` → final delivery. Button postbacks and matching-text fallbacks resolve advances in `src/flows/steps.ts`; state gates prevent skipping steps. The follow gate re-checks `is_user_follow_business` before final delivery and parks the row as `waiting_follow` until a postback/`READY`.

### Admin auth (dual mode)

`/admin/*` accepts either the long-lived bearer `ADMIN_TOKEN` or a browser session: login (username + password + admin token, optional Turnstile) sets an HttpOnly `SameSite=Strict` cookie scoped to `/admin`, and every session request must also send the per-session `X-CSRF-Token` header (rotated on resume) and match a user-agent hash. Session/CSRF/actor identifiers are stored only as HMAC hashes keyed by `ADMIN_TOKEN`. Rate limits (per-IP and global failed-auth) run before auth; every request is audit-logged; HSTS is set over HTTPS. The `/admin-ui` shell is static and embeds no data — everything loads post-login via the CSRF-protected bootstrap.

### Token vault

`INSTAGRAM_ACCESS_TOKEN` (env) is the fallback. When `TOKEN_ENCRYPTION_KEY` is set (32+ characters enforced), the long-lived token lives AES-GCM-encrypted in D1 (`src/security/secret-box.ts`) and cron refreshes it on a ~45-day cadence. Never bypass the encryption or change the KDF — operators' existing ciphertexts would become undecryptable.

### Messaging account scoping (opt-in)

Instagram Messaging webhook recipient IDs can legitimately differ from the Graph account ID used by comment webhooks. By default messaging events are accepted (signature + router state scope them); setting `INSTAGRAM_MESSAGING_ACCOUNT_IDS` (comma-separated) turns on strict allowlist enforcement in `src/meta/webhook.ts`.

## Security Invariants (do not weaken)

- Webhook POSTs verify `X-Hub-Signature-256` over **raw bytes before any parsing**; missing/placeholder secrets fail closed (503); bodies are size-capped while streaming.
- All secret comparisons hash first, then `timingSafeEqual` (`src/security/constant-time.ts`).
- All D1 access goes through `Repository` with prepared statements and `.bind()` — no SQL string building from input.
- The admin UI renders exclusively via `textContent`/`createElement` under a nonce CSP — never introduce `innerHTML` or inline handlers.
- Upstream Meta error messages pass through `redactSensitiveText` before storage or API responses.
- Keep the `AUTOMATION_ENABLED` kill switch intact; campaigns default to draft (`enabled: false`).
- Official Meta API only — never unofficial Instagram APIs, session cookies, scraping, or browser automation.

## Conventions

- **Conventional Commits** required (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, …); imperative, lowercase subject, no trailing period. Security fixes use `fix:`.
- This repo uses **zod 4** (`z.ZodIssueCode.custom` for custom refinement issues) and TypeScript 6.
- Tests are vitest: hand-rolled D1 stubs per file plus a real Miniflare D1 integration suite (`tests/d1-integration.test.ts`, migrations imported via `?raw`). Routes are exercised via `app.request(path, init, env)` with env injected as the third argument.
- Examples and fixtures must use generic names only (`Example Creator`, `@example_creator`, keyword `Blue Green`) — no real accounts, keywords, or deployment IDs.
- OSS meta files (`LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue templates) are part of the product; keep them consistent when behavior changes.
