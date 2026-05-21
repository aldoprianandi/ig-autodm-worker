# Cost and Operations

## Cost Model

### Cloudflare-Based MVP

| Component | Expected cost |
|---|---:|
| Meta Developer App | `$0` |
| Instagram Graph/Messaging API | `$0` |
| Cloudflare Workers Free | `$0` |
| Cloudflare D1 Free | `$0` |
| Cloudflare Queues Free | `$0` |
| `workers.dev` subdomain | `$0` |
| Custom domain | optional, around `$8-$15/year` |
| OpenAI | `$0` when static delivery is used |

Cloudflare free tier is enough for early traffic when each user creates only a few webhook and API events.

### Cloudflare Queues Cost Notes

Queues bill by operations. A normal delivery job is usually three operations: write, read, delete. Each queue retry adds another read operation, and platform-level exhaustion can write the message to the DLQ.

Current planning assumptions:

- Workers Free includes 10,000 Queues operations per day and 24-hour message retention.
- Workers Paid includes 1,000,000 Queues operations per month, then about `$0.40` per million operations.
- Queue messages are limited to 128 KB; this template sends small delivery job payloads.
- Platform limits relevant here include up to 100 message retries, consumer batches up to 100 messages, retry delays up to 24 hours, about 5,000 messages/second per queue, and a 25 GB per-queue backlog.
- This repo uses `max_batch_size=1`, `max_retries=5`, `retry_delay=60`, `max_concurrency=2`, and a DLQ named `ig-autodm-deliveries-dlq` in `wrangler.example.toml`.

Check Cloudflare pricing before high-volume campaigns; viral posts can spend the free daily operation budget quickly because retries also count.

### When To Upgrade Workers

Upgrade to Workers Paid when:

- webhook traffic exceeds free daily request limits.
- queue operations exceed free limits.
- longer CPU time or better observability is needed.
- this becomes business-critical.

Expected minimum: `$5/month` for Workers Paid.

## Traffic Scenarios

Assumption per user:

- one comment webhook.
- one opening delivery.
- one public comment reply delivery when configured.
- one button/postback or matching text-fallback webhook in the public safety profile.
- one final delivery.
- two to five database writes.

| Monthly engaged users | Worker requests | D1 writes | Infra estimate |
|---:|---:|---:|---:|
| 1,000 | about 2,000-5,000 | about 5,000 | `$0` |
| 10,000 | about 20,000-50,000 | about 50,000 | `$0` |
| 100,000 | about 200,000-500,000 | about 500,000 | `$0-$5+` depending on daily spikes |

The risk is not total monthly usage first. The risk is a viral post creating a daily spike and hitting free daily limits.

## AI Cost

Static delivery:

```text
AI cost = $0
```

Dynamic AI delivery:

```text
cost = input_tokens / 1,000,000 * input_price + output_tokens / 1,000,000 * output_price
```

Use AI only for:

- rewriting approved campaign text.
- classifying comments.
- answering follow-up DM questions after the MVP works.

Do not use AI for:

- the App Review demo.
- deciding whether to bypass a policy.
- sending sensitive secrets or raw webhook headers.

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
