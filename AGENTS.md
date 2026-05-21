# AGENTS.md

Operational guidance for AI/code agents working in this repository.

## Project Summary

This repo is an open-source template for a single-account Instagram comment-to-DM automation service running on Cloudflare Workers.

Runtime primitives:

- Cloudflare Worker
- D1 binding: `DB`
- Queue binding: `DELIVERY_QUEUE`
- Cron trigger: every minute
- Meta/Instagram API only; no Instagram password, session cookies, scraping, or browser automation.

The default public flow is intentionally narrow:

1. A user comments a configured keyword on a configured Instagram media ID.
2. Meta webhook or fallback polling records a normalized comment event.
3. The Worker queues an opening private reply.
4. If the opening delivery is marked `sent`, fallback public comment reply queues the configured `commentReplyText`.
5. Final prompt delivery normally requires a button postback or matching text.
6. Automatic final fallback is behind `AUTO_FINAL_AFTER_OPENING=true` and should stay off for App Review-grade behavior.
7. Cron also runs token refresh, old-row cleanup, stale delivery recovery, and optional fallback queueing.

## Non-Negotiable Safety Rules

- Never print, paste, commit, or summarize real secret values.
- Never inspect `.dev.vars` unless the task explicitly requires validating key names; if opened, redact values in output.
- Do not pass access tokens, app secrets, raw webhook headers, or admin bearer tokens into prompts, docs, logs, screenshots, or test fixtures.
- Do not use unofficial Instagram APIs, browser bots, session cookies, `instagram-private-api`, Selenium, or mobile session replay.
- Do not disable `X-Hub-Signature-256` verification for production webhook POSTs.
- Do not remove the `AUTOMATION_ENABLED` kill switch.
- Do not bypass `TOKEN_ENCRYPTION_KEY` for stored Instagram tokens; D1 token rows must remain encrypted.
- Do not broaden campaign behavior to all posts unless the operator explicitly asks for it.
- Keep `wrangler.toml`, `.dev.vars`, `.env`, `.wrangler`, and production deployment notes out of public commits.

## Commands

Run these before claiming code changes are ready:

```bash
npm run typecheck
npm run infra:validate
npm run test:coverage
npm audit --json
npm audit signatures
npm run scan:oss
git diff --check
```

Deploy only after tests pass:

```bash
npm run deploy
```

Health check after deploy:

```bash
curl -fsS https://<worker-name>.<cloudflare-account>.workers.dev/health
```

## Git And Commit Rules

- Use Conventional Commits for every commit subject.
- Keep subjects short, imperative, lowercase after the type unless using a proper noun, and do not end with a period.
- Never include secret names with real values, account IDs, live media IDs, token fragments, or sensitive operational details in commit messages.
- Before pushing, verify branch commits since `main` use Conventional Commit subjects:

```bash
git log --format='%s' main..HEAD | rg -n -v '^(feat|fix|docs|test|chore|refactor|perf|ci|build|style|revert)(\([^)]+\))?!?: ' || true
```

## Sensitive Files

- `.dev.vars`: local secret values, ignored by git. Do not print values.
- `wrangler.toml`: local deployment resource IDs, ignored by git. Publish only `wrangler.example.toml`.
- `.wrangler/`: local Cloudflare cache, ignored by git.

## Important Runtime Files

- `src/index.ts`: Worker routes, webhook entrypoint, scheduled handler.
- `src/admin/routes.ts`: admin API, bearer auth, browser session resume, CSRF-protected bootstrap, rate limit, audit log, upstream error sanitization.
- `src/admin/ui.ts`: static browser admin console shell; data flows through protected `/admin/*` APIs.
- `src/security/signature.ts`: Meta HMAC verification.
- `src/security/redaction.ts`: runtime redaction for token-like strings.
- `src/security/secret-box.ts`: AES-GCM helper for encrypted token storage.
- `src/meta/webhook.ts`: webhook payload normalization.
- `src/meta/api.ts`: outbound Instagram API client.
- `src/token/manager.ts`: encrypted stored token lookup and long-lived token refresh.
- `src/ops/maintenance.ts`: scheduled cleanup and token-refresh orchestration.
- `src/flows/router.ts`: campaign matching and state transition.
- `src/poller/comments.ts`: fallback comment polling, public comment reply, and optional automatic final delivery.
- `src/queue/consumer.ts`: delivery job processing and Meta send retries.
- `src/queue/recovery.ts`: re-enqueues stale queued/retrying delivery rows and marks stale processing rows `send_status_unknown`.
- `src/db/repository.ts`: D1 access layer.

## Documentation Rules

- Keep README high level and current.
- Keep endpoint details in `docs/09-api-reference.md`.
- Keep feature status in `docs/10-feature-matrix.md`.
- Keep setup and production procedures in `docs/runbook.md`.
- Do not put real token values, production account IDs, live URLs, media IDs, or campaign IDs in docs.

## Security Review Checklist

- Webhook POST requires HMAC before JSON parsing/routing.
- Admin routes require bearer auth or a DB-backed browser session, with rate limiting before privileged work.
- Meta access token is sent through `Authorization` headers, not URL query params except Meta refresh endpoints that require token parameters.
- Stored Instagram tokens are encrypted at rest with `TOKEN_ENCRYPTION_KEY`.
- Browser admin UI must not embed secret values or production data.
- Browser session resume may use `GET /admin/session`, but it must keep the session cookie HttpOnly, validate user-agent hash, and rotate CSRF before protected API calls.
- Outbound sends pass the local `outbound_rate_limits` limiter before Meta calls.
- Delivery jobs are claimed before sending; stale queued/retrying rows are recovered by cron, while stale processing rows require manual reconciliation.
- Upstream error messages are redacted before API responses or delivery storage.
- D1 queries use prepared statements and `.bind()`.
- Queue and poller paths are idempotent through delivery/event unique keys.
- `.dev.vars` and `wrangler.toml` are untracked and ignored.
- `npm audit --json` has no actionable vulnerabilities.

## Production Guardrails

- Default to narrow campaign scope by media ID and keyword.
- Prefer disabling a campaign or setting `AUTOMATION_ENABLED=false` over risky live debugging.
- Treat connected Instagram accounts as production accounts.
- If a token may have leaked, recommend rotation and record only that rotation happened, not the token.
