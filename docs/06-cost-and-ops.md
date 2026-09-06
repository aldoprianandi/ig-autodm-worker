# Cost and Operations

## Estimate usage, not audience size

There is no project subscription fee. Infrastructure usage can still hit quotas or incur charges. Do not infer a bill from monthly followers or engaged users alone: retries, indexes, periodic work, and daily spikes all matter.

Pricing references checked on 2026-09-06; verify the linked provider pages before choosing a plan.

| Free-plan resource | Included allowance / relevant limit |
| --- | --- |
| D1 reads | 5 million rows per day |
| D1 writes | 100,000 rows per day |
| Queues | 10,000 operations per day; 24-hour retention |
| Worker external subrequests | 50 per invocation |

Sources: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

A typical queue message uses write, read, and delete operations. Three deliveries for one flow therefore start around nine queue operations, before retries or recovery. D1 work also includes event deduplication, state updates, claims, rate limits, and index maintenance—not merely one write per user.

Use measured D1 `rows_read` / `rows_written`, queue operations, and Worker outcomes to project daily usage. Include other services sharing the same account. Paid usage is not an unlimited guarantee; consult [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) before changing plans.

## Built-in work limits

- Polling: up to 10 media per minute, with the latest 25 comments per selected media.
- Full fallback rotation: ceil(enabled media count / 10) minutes. For example, 30 media take three minutes.
- Delivery recovery: every five minutes, using status-led indexes.
- Cleanup and token maintenance: hourly.
- Queue configuration: one-message batches, five platform retries, 60-second delay, and maximum concurrency two.

Webhooks remain the primary real-time path. Polling can miss comments that leave its latest-comment window; it is not an unlimited historical import.

## D1 daily rows-read limit exceeded

A read quota is not a storage limit. Deleting old delivery records is not a quota reset and can remove deduplication evidence.

1. Inspect D1 query analytics to identify scans and their frequency. Avoid repeated broad diagnostic queries while quota is constrained.
2. Check pending remote migrations and apply the recovery indexes with `npm run db:migrate:remote` during an appropriate maintenance window.
3. Confirm the deployed Worker contains the bounded polling and recovery cadence; a GitHub push alone does not deploy it.
4. If daily quota is already exhausted, affected queries can continue failing until the 00:00 UTC reset or an operator-approved plan change. Index creation also requires database access.
5. After access returns, verify scheduled outcomes, queue recovery, and actual deliveries—not just `/health`.

See [D1 quota behavior](https://developers.cloudflare.com/d1/platform/pricing/) for provider details. Use the established retention policy, rather than ad hoc deletion of campaign history.

## Worker CPU or subrequest failures

Check invocation outcomes for CPU-limit failures and inspect sanitized logs. Do not increase polling to all enabled media in a single run. One inaccessible media request is isolated, but a successful cron outcome alone does not prove every Meta call succeeded.

Use the [runtime audit](11-runtime-audit-2026-09-06.md) and [runbook](runbook.md) to distinguish code checks from live integration verification.

## Operational Dashboard

Available through `GET /admin/dashboard`:

- Campaign, contact, webhook, and delivery counts.
- Failed and retrying delivery counts.
- Instagram token source, expiry, and last sanitized refresh error.
- Admin request limit, local Meta send limit, and poll limit per media.

Additional detail remains available through D1 queries and `GET /admin/audit-logs`.

## Runbooks

### Webhook Verification Fails

1. Confirm `META_VERIFY_TOKEN` in Cloudflare secrets.
2. Confirm Meta dashboard callback URL.
3. Call `GET /webhooks/meta?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123`.
4. Expected response body: `123`.

### No Comment Events Arrive

1. Confirm app mode and tester roles.
2. Confirm Instagram account is Business or Creator.
3. Confirm webhook subscription includes comments.
4. Confirm the post belongs to the connected account.
5. Check Cloudflare Worker logs for incoming requests.

### DM Send Fails

1. Check Meta API error code.
2. Confirm messaging permission access level.
3. Confirm user interaction opened a valid messaging context.
4. Confirm the access token belongs to the connected IG professional account.
5. Retry only on rate limit, server errors, local rate-limit, or transient follow-status failures.
6. Queue retries use a fixed 60-second delay and delivery attempts are capped at 5.

### Dead Letter Queue Has Messages

1. Set `AUTOMATION_ENABLED=false` or disable the affected campaign if sends are still failing.
2. Inspect Cloudflare Queues metrics for `ig-autodm-deliveries` and `ig-autodm-deliveries-dlq`.
3. Use the DLQ payload `deliveryId` to inspect the D1 `deliveries` row and sanitized `error_code`/`error_message`.
4. Fix the root cause first: token expiry, missing permission, Meta rate limit, malformed campaign content, or recipient/message-window rejection.
5. Do not blindly replay old DLQ messages. Confirm the Instagram messaging/private reply window still allows the send.
6. This template does not expose a generic DLQ replay endpoint. Use the specific follow-retry endpoint for `waiting_follow` final deliveries, or use trusted operator tooling to re-enqueue only policy-safe deliveries.

Normal app-level Meta retry exhaustion usually marks the D1 `deliveries` row as `failed` and acknowledges the queue message. The DLQ is mostly for unacked consumer failures, platform-level retry exhaustion, or unexpected worker crashes before the app can record a terminal delivery state.

### Viral Spike

1. Disable campaign if queue grows faster than sends.
2. Keep the local `META_SENDS_PER_MINUTE` limiter conservative until Meta usage is known.
3. Prioritize users who tapped the DM button over users who only commented.
4. Consider upgrading Workers Paid.
5. Export failed deliveries for manual follow-up.

### Token Refresh Fails

1. Confirm `TOKEN_ENCRYPTION_KEY` exists as a Worker secret.
2. Confirm the bootstrap `INSTAGRAM_ACCESS_TOKEN` still works.
3. Check `/admin/dashboard` for the sanitized `lastError`.
4. If the token is expired, generate a fresh long-lived Instagram token and update `INSTAGRAM_ACCESS_TOKEN`.

## Kill Switch

The admin API must support:

```bash
read -r -s ADMIN_TOKEN
curl -X PATCH "https://<worker-name>.<cloudflare-account>.workers.dev/admin/campaigns/<campaign-id>" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"enabled": false}'
unset ADMIN_TOKEN
```

This must stop new sends while still returning HTTP `200` to Meta webhooks.
