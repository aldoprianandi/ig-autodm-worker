# Runbook

## Required Verification Before Deploy

```bash
npm run typecheck
npm test
npm audit --json
npm audit signatures
npm run scan:oss
git diff --check
```

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Copy local templates:

```bash
cp .dev.vars.example .dev.vars
cp wrangler.example.toml wrangler.toml
```

3. Fill `.dev.vars` with local test values. Do not commit `.dev.vars`.

4. Apply local D1 migrations:

```bash
npm run db:migrate:local
```

5. Start local Worker:

```bash
npm run dev
```

6. Check health:

```bash
curl http://localhost:8787/health
```

Expected:

```json
{"ok":true,"service":"ig-autodm-worker"}
```

## Create a Local Campaign

With the Worker running:

```bash
curl -X POST "http://localhost:8787/admin/campaigns" \
  -H "Authorization: Bearer replace-with-random-admin-token" \
  -H "Content-Type: application/json" \
  --data @examples/create-campaign.json
```

Expected:

```json
{"ok":true,"campaign":{"id":"prompt-test"}}
```

## Verify Meta Webhook Challenge Locally

Use the same value as `META_VERIFY_TOKEN`:

```bash
curl "http://localhost:8787/webhooks/meta?hub.mode=subscribe&hub.verify_token=replace-with-random-webhook-verify-token&hub.challenge=12345"
```

Expected:

```text
12345
```

## Cloudflare Setup

1. Create D1:

```bash
npx wrangler d1 create ig-autodm-worker
```

2. Copy the printed `database_id` into local `wrangler.toml`.

3. Create queues:

```bash
npx wrangler queues create ig-autodm-deliveries
npx wrangler queues create ig-autodm-deliveries-dlq
```

4. Store secrets:

```bash
npx wrangler secret put META_APP_SECRET
npx wrangler secret put META_VERIFY_TOKEN
npx wrangler secret put INSTAGRAM_ACCESS_TOKEN
npx wrangler secret put INSTAGRAM_ACCOUNT_ID
npx wrangler secret put INSTAGRAM_MESSAGING_ACCOUNT_IDS
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put ADMIN_LOGIN_USERNAME
npx wrangler secret put ADMIN_LOGIN_PASSWORD
npx wrangler secret put AUTOMATION_ENABLED
npx wrangler secret put TOKEN_ENCRYPTION_KEY
```

Optional:

```bash
npx wrangler secret put INSTAGRAM_APP_SECRET
npx wrangler secret put META_SENDS_PER_MINUTE
npx wrangler secret put AUTO_FINAL_AFTER_OPENING
npx wrangler secret put TURNSTILE_SITE_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Set optional `INSTAGRAM_MESSAGING_ACCOUNT_IDS` only if Meta Messaging webhook payloads use entry or recipient IDs that differ from `INSTAGRAM_ACCOUNT_ID`. Use a comma-separated list.

5. Keep automation disabled for first deploy:

```text
AUTOMATION_ENABLED=false
```

6. Apply remote migrations:

```bash
npm run db:migrate:remote
```

7. Deploy:

```bash
npm run deploy
```

8. Save the Worker URL. It will look like:

```text
https://<worker-name>.<cloudflare-account>.workers.dev
```

## Meta Dashboard Setup

Use these callback URLs after deploy:

```text
Webhook callback:
https://<worker-name>.<cloudflare-account>.workers.dev/webhooks/meta

Webhook verify token:
same value as META_VERIFY_TOKEN
```

Request only the permissions needed for this template:

```text
instagram_business_basic
instagram_business_manage_comments
instagram_business_manage_messages
```

## Manual End-to-End Test

1. Create a campaign for a real Instagram media ID.
2. From a tester Instagram account, comment the configured keyword.
3. Confirm Cloudflare logs show a valid comment webhook or cron poller activity.
4. Confirm the opening private reply arrives.
5. Tap the configured button and confirm the final prompt arrives.
6. Confirm public comment reply appears only after the opening delivery succeeds.
7. Keep `AUTO_FINAL_AFTER_OPENING=false` unless you intentionally need fallback final delivery.

## Browser Admin Console

Open:

```text
https://<worker-name>.<cloudflare-account>.workers.dev/admin-ui
```

Log in with browser username, browser password, and admin security key. The page posts them once to `/admin/session`, then uses a short-lived HttpOnly cookie plus an in-memory CSRF token for `/admin/*` requests.

Optional Turnstile layer:

1. In Cloudflare Dashboard, create a Turnstile widget.
2. Add your Worker hostname.
3. Set `TURNSTILE_SECRET_KEY`.
4. Set `TURNSTILE_SITE_KEY`.
5. Redeploy or wait for config propagation.

When both keys are present, `/admin-ui` renders the Turnstile widget and `/admin/session` rejects login attempts without a valid Turnstile token.

## Security Model

- `/admin-ui` is a static shell and does not embed campaign data or secret values.
- All reads and writes go through authenticated `/admin/*` APIs.
- Browser admin sessions are stored hashed in D1 and expire after 30 minutes.
- Browser refresh resume rotates CSRF.
- `GET /admin/session` does not return campaign/template data.
- Security headers include no-store, CSP nonce, anti-frame, nosniff, no-referrer, and restricted permissions policy.

## Instagram Token Refresh

Automatic refresh uses Meta's long-lived Instagram token refresh endpoint and stores the refreshed token encrypted in D1.

Requirements:

- `TOKEN_ENCRYPTION_KEY` must be present and at least 32 characters of random key material.
- `INSTAGRAM_ACCESS_TOKEN` remains the bootstrap fallback.
- The token must still be valid and old enough for Meta to refresh.

If refresh succeeds, future Meta calls use the encrypted D1 token before the bootstrap env token. If refresh fails, the last sanitized error is visible through `/admin/dashboard`.

## Emergency Stop

Global kill switch:

```bash
npx wrangler secret put AUTOMATION_ENABLED
```

Set the value to:

```text
false
```

You can also disable individual campaigns through `/admin-ui` or the admin API.

## Production Checklist

- `wrangler.toml` exists locally and is ignored by git.
- D1 and queue names match your Cloudflare resources.
- `.dev.vars` is not tracked.
- `AUTOMATION_ENABLED=false` for first deploy.
- Webhook challenge succeeds.
- Signed webhook POST is accepted and unsigned POST is rejected.
- Admin UI requires login and does not expose data before session creation.
- Token status is visible in `/admin/dashboard` without returning token values.
- A test campaign works end to end.
- `AUTOMATION_ENABLED=true` is set only after the test campaign is verified.
