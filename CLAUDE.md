<!-- Recreated 2026-10-08 from AGENTS.md (Codex) + repo verification. AGENTS.md remains for Codex. -->
# ig-autodm-worker (public OSS template)

Open-source (MIT, v0.2.0), single-account Instagram comment-to-DM automation template on Cloudflare Workers (Hono + D1 + Queues, TypeScript 6, **zod 4**), official Meta Instagram API only. Public repo `github.com/aldoprianandi/ig-autodm-worker`. Aldo's production deployment is the sibling repo `ig-autodm-selfhost`.

**Everything committed here is public.** No operator branding, account/app/media/campaign IDs, live URLs, real keywords, token fragments, or deployment facts — in code, docs, fixtures, or commit messages. `npm run scan:oss` enforces this in CI.

Runtime primitives: Worker, D1 binding `DB`, queue binding `DELIVERY_QUEUE` (`max_retries = 5`, DLQ), one cron `* * * * *` (polling every minute, delivery recovery every 5 min, cleanup/token maintenance hourly — `src/ops/schedule.ts`).

## Default public flow (intentionally narrow)

1. User comments a configured keyword on a configured media ID.
2. Meta webhook or fallback polling records a normalized comment event.
3. Worker queues an opening private reply.
4. Once the opening is `sent`, fallback public comment reply queues `commentReplyText`.
5. Optional intermediate DM button steps (max 3); final prompt normally requires a button postback or matching text.
6. Automatic final fallback is behind `AUTO_FINAL_AFTER_OPENING=true` — keep it off (App Review-grade behavior).
7. Cron runs token refresh, old-row cleanup, stale delivery recovery, optional fallback queueing.

Campaigns default to draft (`enabled: false`).

## Commands

```bash
cp wrangler.example.toml wrangler.toml   # local only, gitignored; fill your own IDs
cp .dev.vars.example .dev.vars           # local secrets, gitignored; never print values
npm run doctor                           # offline, read-only setup check (Node >= 22)
npm run dev                              # wrangler dev
npm test -- tests/admin.test.ts          # single file;  npm test -- -t "name"  to filter
npm run db:migrate:local
```

Before claiming a change is ready (matches `.github/workflows/ci.yml`):

```bash
npm run typecheck
npm run infra:validate      # dry-run deploy with wrangler.example.toml + example migration check
npm run test:coverage       # thresholds: statements 85 / branches 75 / functions 85 / lines 85
npm audit --json
npm audit signatures
npm run scan:oss
npm run docs:check          # local doc-link validation
git diff --check
```

Deploy (operator's own account, only when asked): `npm run deploy`, then `curl -fsS https://<worker-name>.<cloudflare-account>.workers.dev/health`. `/health` alone doesn't verify D1, cron, or Meta — verify migrations against the target DB before calling a deploy complete.

## Architecture

`src/index.ts` exports one Worker with three entrypoints:

- **fetch** (Hono): legal pages, `GET/POST /webhooks/meta`, Meta data-deletion callback (`src/security/signed-request.ts`), `/admin-ui` shell (`src/admin/ui.ts`, headers/CSP/HSTS in `ui-auth.ts`), `/admin/*` API (`src/admin/routes.ts`). Streaming body caps in `src/http/body.ts`.
- **queue**: `processDeliveryBatch` (`src/queue/consumer.ts`) — claims, sends via `src/meta/api.ts`; every Meta call wrapped in `runRetryableMetaCall` so thrown network errors mark the row retrying instead of crashing the batch.
- **scheduled**: poller (`src/poller/comments.ts`), recovery (`src/queue/recovery.ts`), maintenance + token refresh (`src/ops/maintenance.ts`, `src/token/manager.ts`).

Event pipeline: webhook + poller normalize (`src/meta/webhook.ts`) → `FlowRouter.handleEvent` (`src/flows/router.ts`): dedupe via `webhook_events` (`INSERT OR IGNORE`) → match campaign by media ID + fuzzy keyword (`src/flows/keyword.ts`, Damerau-Levenshtein, Indonesian stop-words, token assignment) → `deliveries` row → enqueue. Steps: `steps.ts`; variants: `variants.ts`; opening retry: `opening-retry.ts`. All D1 access: `src/db/repository.ts`.

**Idempotency is load-bearing.** Delivery IDs are deterministic (`${campaignId}:${igUserId}:${type}`) with a UNIQUE constraint; webhook, poller, and recovery race safely (`createDelivery` → `false` = already done). Consumer claims (`claimDeliveryForSend` → `processing`) before sending. Stale queued/retrying rows are re-enqueued by cron; stale `processing` rows become `send_status_unknown` (manual reconciliation).

Contact state (`contact_states`): `commented` → optional `button_step:N` → `confirmed` / `follow_requested` → final; follow gate parks as `waiting_follow` until postback/`READY`.

Token vault: `INSTAGRAM_ACCESS_TOKEN` env is the fallback; with `TOKEN_ENCRYPTION_KEY` (min 32 chars) the long-lived token is AES-GCM encrypted in D1 (`src/security/secret-box.ts`) and refreshed near expiry. Never change the KDF/format — operators' existing ciphertexts would break.

Messaging scoping: messaging webhook recipient IDs may differ from the Graph account ID. Accepted by default (signature + router state scope them); `INSTAGRAM_MESSAGING_ACCOUNT_IDS` (comma-separated) enables a strict allowlist.

## Non-negotiable safety rules

- Never print, paste, commit, or summarize real secret values. Don't open `.dev.vars` unless validating key names (redact values). Keep tokens, app secrets, raw webhook headers, admin bearer tokens out of prompts, docs, logs, screenshots, fixtures.
- Official Meta API only — no unofficial Instagram APIs, browser bots, session cookies, `instagram-private-api`, Selenium, mobile session replay.
- Never disable `X-Hub-Signature-256` verification for production webhook POSTs.
- Never remove the `AUTOMATION_ENABLED` kill switch.
- Never bypass `TOKEN_ENCRYPTION_KEY`; D1 token rows stay encrypted.
- Don't broaden campaigns to all posts unless the operator explicitly asks.
- Keep `wrangler.toml`, `.dev.vars`, `.env`, `.wrangler/`, and deployment notes out of commits. Publish only `wrangler.example.toml`.

## Security review checklist

- Webhook POST: HMAC over raw bytes before JSON parsing/routing; placeholder/missing secrets fail closed; bodies capped while streaming.
- Secret comparisons: hash then `timingSafeEqual` (`src/security/constant-time.ts`).
- Admin: bearer `ADMIN_TOKEN` or DB-backed browser session; rate limiting before privileged work; audit log. Session cookie HttpOnly `SameSite=Strict`; `X-CSRF-Token` per session; `GET /admin/session` resume validates user-agent hash and rotates CSRF; Turnstile when configured.
- Admin UI embeds no secrets or production data; `textContent`/`createElement` under nonce CSP — no `innerHTML`, no inline handlers.
- Meta token in `Authorization` header, not URL params (except Meta refresh endpoints that require token params).
- Outbound sends pass `outbound_rate_limits` before Meta calls.
- Upstream errors → `redactSensitiveText` (`src/security/redaction.ts`) before API responses or delivery storage.
- D1: prepared statements + `.bind()`. Admin inputs Zod-validated in `routes.ts` (zod 4: `z.ZodIssueCode.custom` for custom issues).
- Idempotent queue/poller paths. `.dev.vars` and `wrangler.toml` ignored. `npm audit --json` clean.

## Regression & migration rules

- Fallback polling rotates at most 10 media per minute — never restore unbounded all-media polling; webhook processing stays immediate; document full-rotation latency.
- A failed media poll must not block other media or delivery fallback.
- Preserve terminal delivery evidence on duplicate queue messages or when disabling automation.
- Never requeue `send_status_unknown` automatically or via ordinary retries.
- Upstream follow-status failures count toward the retry cap; only local throttling is exempt.
- Intermediate steps and final delivery require user interaction; automatic final fallback stays opt-in.
- Recovery tests: thousands of terminal rows, assert actual D1 `rows_read` (`tests/d1-integration.test.ts`, Miniflare, migrations imported via `?raw`).
- Keep this repo's migration history (`0001`–`0016`). The template splits selfhost's `0013` into `0013`–`0015`; never copy migrations across repos.

## Tests & fixtures

Vitest with hand-rolled D1 stubs per file plus the Miniflare integration suite; routes via `app.request(path, init, env)`. `.mjs` tests cover doctor, doc links, OSS metadata. Fixtures/examples use generic names only (`@example_creator`, keyword `Blue Green`).

## Docs & OSS files

README (EN) high level, `docs/README.id.md` Indonesian quick start. Endpoints → `docs/09-api-reference.md`; feature status → `docs/10-feature-matrix.md`; setup/production procedures → `docs/runbook.md`; changes → `CHANGELOG.md` (Unreleased). `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `SUPPORT.md`, `.github/ISSUE_TEMPLATE/*`, PR template are part of the product — keep consistent when behavior changes.

## Git

- Conventional Commits only (`feat|fix|docs|test|chore|refactor|perf|ci|build|style|revert`), short, imperative, lowercase after type, no period. Security fixes use `fix:`. No IDs, live media IDs, token fragments, or ops details in messages.
- Before pushing:
  `git log --format='%s' main..HEAD | rg -n -v '^(feat|fix|docs|test|chore|refactor|perf|ci|build|style|revert)(\([^)]+\))?!?: ' || true`
- Don't install or rewrite personal/global skills as part of repo maintenance. Don't edit `AGENTS.md` (Codex).
