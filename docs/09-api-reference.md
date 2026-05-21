# API Reference

This service exposes a small public Worker surface and a protected admin surface. All examples use placeholders; do not paste real secrets into docs, issues, screenshots, or fixtures.

## Base URLs

Local:

```text
http://localhost:8787
```

Production:

```text
https://<worker-name>.<cloudflare-account>.workers.dev
```

## Public Endpoints

### `GET /health`

Returns service health.

```json
{"ok":true,"service":"ig-autodm-worker"}
```

### `GET /`

Minimal landing page with links to legal pages.

### `GET /privacy`

Privacy policy page for Meta App Review.

### `GET /terms`

Terms of service page for Meta App Review.

### `GET /data-deletion`

Human-readable data deletion instructions. `/data_deletion` is also supported as a Meta dashboard compatibility alias.

### `POST /data-deletion`

Meta-compatible data deletion callback.

Request body:

```text
signed_request=<Meta signed_request>
```

Behavior:

- Verifies the signed request with `META_APP_SECRET`.
- Requires `user_id` in the signed payload.
- Deletes matching `deliveries`, `contact_states`, and `webhook_events` rows for that Instagram user ID.
- Records an operational event with deletion counts and a confirmation code.
- Stores the signed request hash as `processing` during deletion and marks it `completed` only after the deletion event is durable. A successful replay returns the same confirmation response; a failed in-flight deletion releases the claim so Meta can retry.

Response:

```json
{
  "url": "https://<worker-name>.<cloudflare-account>.workers.dev/data-deletion/status/<confirmation-code>",
  "confirmation_code": "<uuid>"
}
```

### `GET /data-deletion/status/:code`

Returns an HTML status page for a deletion confirmation code. Malformed or unknown codes return `404` without exposing stored user data.

### OAuth Callback

`/auth/instagram/callback` is not implemented in this template. Single-account setup uses a Meta-generated Instagram access token stored as `INSTAGRAM_ACCESS_TOKEN`.

## Meta Webhook Endpoints

### `GET /webhooks/meta`

Meta webhook verification challenge.

Required query params:

- `hub.mode=subscribe`
- `hub.verify_token=<META_VERIFY_TOKEN>`
- `hub.challenge=<challenge>`

Returns the challenge as plain text when the verify token matches. Returns `403` otherwise.

### `POST /webhooks/meta`

Receives Meta webhook events.

Required header:

```text
X-Hub-Signature-256: sha256=<hmac>
```

Security behavior:

- HMAC is verified before JSON parsing.
- `META_APP_SECRET` is required.
- `INSTAGRAM_APP_SECRET` is accepted as an optional migration/compatibility secret.
- Invalid or missing signatures return `401`.
- Signed malformed JSON returns `400`.

Supported normalized event types:

- `comment.created`
- `message.postback`
- `message.text`

## Admin Authentication

CLI/script calls can pass the admin token from an environment variable:

```bash
read -r -s ADMIN_TOKEN
curl -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  "https://<worker-name>.<cloudflare-account>.workers.dev/admin/campaigns"
unset ADMIN_TOKEN
```

Browser dashboard calls use `POST /admin/session` with `ADMIN_LOGIN_USERNAME`, `ADMIN_LOGIN_PASSWORD`, and `ADMIN_TOKEN`. The server sets an `HttpOnly`, `SameSite=Strict` cookie and returns an in-memory CSRF token. Protected browser calls must send `X-CSRF-Token`.

Admin middleware behavior:

- DB-backed rate limiting runs before bearer/session comparison.
- Missing D1 admin storage fails closed with `503`.
- Failed auth returns generic `401`.
- Per-IP, login-specific, and global failed-auth limits return `429`.
- Audit logs record action type and status, not token values.

### `POST /admin/session`

Creates a 30-minute browser admin session.

```json
{
  "username": "admin",
  "password": "replace-with-dashboard-password",
  "adminToken": "replace-with-admin-token"
}
```

Response:

```json
{
  "ok": true,
  "csrfToken": "short-lived-csrf-token",
  "expiresAt": "<iso-8601-expiry>",
  "bootstrap": {
    "dashboard": {},
    "campaigns": [],
    "templates": []
  }
}
```

### `GET /admin/session`

Resumes an existing browser admin session after refresh, validates the user-agent hash, rotates CSRF, and returns only session metadata. Campaign/template data must load afterward through `GET /admin/bootstrap`.

### `DELETE /admin/session`

Revokes the current browser admin session and clears the cookie. Requires the session cookie and matching `X-CSRF-Token`.

### `GET /admin/bootstrap`

Returns the protected browser dashboard bootstrap payload after auth:

```json
{
  "dashboard": {
    "counts": {},
    "token": null,
    "limits": {}
  },
  "campaigns": [],
  "templates": []
}
```

Use this after `GET /admin/session` refreshes CSRF. The session resume endpoint intentionally does not return campaign, template, or dashboard data.

## Campaigns

### `GET /admin/campaigns`

Lists configured campaigns.

### `POST /admin/campaigns`

Creates or upserts a campaign. The public template documents the safety-profile one-button flow. The backend currently normalizes submitted `buttonPayload` to `<campaign-id>:confirm` and `dmSteps` to an empty list from admin writes.

Request:

```json
{
  "id": "prompt-test",
  "name": "Prompt Test",
  "mediaId": "replace-with-instagram-media-id",
  "keyword": "PROMPT",
  "openingText": "Want me to send the guide?",
  "openingTextVariants": [
    "Want me to send the guide?",
    "I can send the guide by DM."
  ],
  "buttonTitle": "SEND",
  "buttonPayload": "prompt-test:confirm",
  "dmSteps": [],
  "deliveryText": "Here is the guide: https://example.com/guide",
  "commentReplyText": "Sent. Check your DM.",
  "commentReplyTextVariants": [
    "Sent. Check your DM.",
    "Done. Please check your DM."
  ],
  "openingFailureReplyText": "I could not send the DM. Please check your message request settings.",
  "followGateEnabled": false,
  "followGateText": null,
  "followGateButtonTitle": null,
  "enabled": false
}
```

Validation and behavior:

- `id` must be 3-64 lowercase letters, numbers, `_`, or `-`.
- `mediaId` must be a Meta ID-like value, not a URL.
- `buttonTitle` max length is 20.
- `buttonPayload` is normalized to `<campaign-id>:confirm`.
- `dmSteps` is reserved for dormant multi-step support and normalized to `[]` by admin writes.
- `openingText`, `deliveryText`, and optional follow-gate text are DM content; keep them within Meta policy.
- `commentReplyText` is public Instagram comment content; keep it short and non-spammy.
- Variants are normalized, deduplicated, and selected deterministically per campaign/user/comment so retries do not change visible text.
- Start new campaigns with `enabled=false`; enable one controlled test campaign only after `AUTOMATION_ENABLED=true` is intentionally set.

### `PATCH /admin/campaigns/:id`

Enables or disables an existing campaign.

```json
{"enabled": false}
```

### `DELETE /admin/campaigns/:id`

Deletes a campaign and associated state rows.

### `POST /admin/deliveries/:campaignId/:igUserId/follow-retry`

Manually requeues a final delivery follow check for a follow-gated campaign/user pair.

Path params:

- `campaignId`: configured campaign ID.
- `igUserId`: Instagram user ID from the contact/delivery row.

Behavior:

- Requires the campaign to exist, be enabled, and have follow gate enabled.
- Requeues only a `waiting_follow` final delivery for that campaign/user pair.
- Sends a new `final` job to `DELIVERY_QUEUE`.

## Admin Operations

### `GET /admin/dashboard`

Returns operational counts, token status metadata, and runtime limit settings. It never returns token values.

### `GET /admin/audit-logs?limit=50`

Returns recent admin audit log rows. `limit` is clamped server-side.

### `GET /admin/subscription`

Fetches current Meta subscribed-app fields for `INSTAGRAM_ACCOUNT_ID`.

Possible upstream failure:

```json
{
  "error": "Instagram subscription fetch failed",
  "upstreamStatus": 400,
  "upstreamError": {}
}
```

### `POST /admin/subscription`

Updates Meta webhook subscribed fields. If the request body is omitted, the default fields are `comments`, `messages`, and `messaging_postbacks`.

```json
{
  "fields": ["comments", "messages", "messaging_postbacks"]
}
```

Response:

```json
{"ok": true, "subscribedFields": ["comments", "messages", "messaging_postbacks"]}
```

## Admin Media Helpers

### `GET /admin/media`

Lists recent Instagram media for the connected professional account. Uses `Authorization` headers for Meta API calls and does not return upstream paging URLs.

### `GET /admin/media/:mediaId/comments`

Lists recent comments for a media item to help operators verify campaign setup. Rejects unsafe path identifiers before upstream calls.

## Variant Templates

Reusable templates are stored in `message_variant_templates`.

### `GET /admin/variant-templates?kind=opening`

Supported `kind` values:

- `opening`
- `comment_reply`

### `POST /admin/variant-templates`

```json
{
  "kind": "comment_reply",
  "text": "Sent. Check your DM."
}
```

### `POST /admin/variant-templates/bulk`

```json
{
  "kind": "comment_reply",
  "texts": ["Sent. Check your DM.", "Done. Please check your DM."]
}
```

## Scheduled Work

Cron runs once per minute and may:

- Refresh long-lived Instagram tokens when due.
- Delete old operational rows.
- Recover stale delivery rows.
- Poll enabled campaign media as a fallback when webhooks are delayed.
- Queue public comment replies after opening deliveries are sent.
- Queue final deliveries after opening only when `AUTO_FINAL_AFTER_OPENING=true`.

Polling is a fallback. Webhooks are the primary ingestion path; high-comment spikes can exceed fallback polling coverage.

## Delivery Retry Behavior

- Outbound sends run through `DELIVERY_QUEUE`, not synchronously inside webhook requests.
- Retryable failures use a fixed 60-second queue retry delay.
- Delivery attempts are capped at 5 before the row is marked `failed`.
- Meta policy/window errors such as messages outside the allowed window are treated as terminal delivery failures, not retried.
- The example Queue consumer also sets `max_retries=5`; app-level Meta retry exhaustion usually marks D1 `deliveries` as `failed`, while the configured DLQ is for unacked/platform-level consumer exhaustion.

## Delivery Types

- `opening`
- `comment_reply`
- `opening_failure_reply`
- `button_step`
- `final`

Admin writes currently keep the public one-button safety profile, so `button_step` is dormant unless campaigns are inserted by trusted operator tooling.

## Required Bindings And Variables

Bindings:

- `DB`
- `DELIVERY_QUEUE`

Required secrets:

- `ADMIN_TOKEN`
- `ADMIN_LOGIN_USERNAME`
- `ADMIN_LOGIN_PASSWORD`
- `AUTOMATION_ENABLED`
- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_ACCOUNT_ID`
- `META_APP_SECRET`
- `META_VERIFY_TOKEN`
- `TOKEN_ENCRYPTION_KEY`

Optional:

- `INSTAGRAM_APP_SECRET`
- `INSTAGRAM_MESSAGING_ACCOUNT_IDS` when Meta Messaging webhook entry or recipient IDs differ from `INSTAGRAM_ACCOUNT_ID`
- `META_SENDS_PER_MINUTE`
- `AUTO_FINAL_AFTER_OPENING`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
