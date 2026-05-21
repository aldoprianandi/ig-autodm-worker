# Security and Compliance

## Threat Model

Assets:

- Meta App Secret.
- Instagram access token.
- Admin API token.
- User-scoped Instagram IDs.
- Campaign content.
- Delivery logs.

Primary threats:

- Forged webhooks.
- Replay or duplicate webhook events.
- Token leakage in logs or commits.
- Unauthorized admin API access.
- Admin bearer-token brute force.
- Sending messages outside user-initiated context.
- Prompt/link delivery to the wrong user.
- Upstream Meta error messages that contain token-like strings.
- Abuse patterns that look like spam.

## Security Controls

### Webhook Authenticity

- Verify `X-Hub-Signature-256` for every `POST /webhooks/meta`.
- Use raw request body bytes for HMAC verification.
- Reject invalid signatures with HTTP `401`.
- Return controlled HTTP `400` for signed malformed JSON.
- Do not process unsigned production webhooks.

### Webhook Verification Token

- Store `META_VERIFY_TOKEN` as a Worker secret.
- Reject `GET /webhooks/meta` verification requests when the provided token differs.

### Secrets

Canonical secret inventory:

- Required Worker secrets:
  - `ADMIN_TOKEN`
  - `ADMIN_LOGIN_USERNAME`
  - `ADMIN_LOGIN_PASSWORD`
  - `AUTOMATION_ENABLED`
  - `INSTAGRAM_ACCESS_TOKEN`
  - `INSTAGRAM_ACCOUNT_ID`
  - `META_APP_SECRET`
  - `META_VERIFY_TOKEN`
  - `TOKEN_ENCRYPTION_KEY`
- Optional Worker config:
  - `INSTAGRAM_MESSAGING_ACCOUNT_IDS` only when Meta Messaging webhook account IDs differ from the comment account ID
  - `META_SENDS_PER_MINUTE`
  - `AUTO_FINAL_AFTER_OPENING`
  - `OPENAI_API_KEY` only if AI generation is enabled later

Never store these in:

- repo files.
- logs.
- screenshots used for App Review.

Outbound Graph API calls must use `Authorization` headers, not `access_token` query parameters, except Meta token refresh endpoints that require token parameters by API contract. Do not log refresh URLs, and keep redaction tests for any upstream refresh errors. Stored Instagram token rows in D1 must remain encrypted with a random `TOKEN_ENCRYPTION_KEY` of at least 32 characters.

### Admin API

- Require CLI/script calls to send `ADMIN_TOKEN` in the `Authorization` header, or use a DB-backed browser session created from `ADMIN_LOGIN_USERNAME`, `ADMIN_LOGIN_PASSWORD`, and `ADMIN_TOKEN` with matching `X-CSRF-Token`.
- Rate limit admin endpoints before bearer/session comparison, using conditional writes so parallel requests cannot trivially bypass the configured cap.
- Rate limit login attempts separately and consume a global failed-auth bucket on failed admin authentication.
- Return generic errors on authentication failure.
- Log admin action type, not the token.
- Store admin session IDs and CSRF tokens only as HMAC hashes in D1; browser session cookies must be `HttpOnly` and `SameSite=Strict`.
- Keep `GET /admin/session` limited to CSRF rotation/session resume metadata. Campaign, dashboard, and template data must load through CSRF-protected `/admin/*` APIs after resume.
- Set `Cache-Control: no-store`, no-referrer, nosniff, anti-frame, and restricted permissions headers on admin API responses.

### Token Strategy

Current template:

- Single Instagram access token stored as a Cloudflare secret for bootstrap.
- Cron refreshes long-lived Instagram tokens when due.
- Refreshed token rows are encrypted in D1 with `TOKEN_ENCRYPTION_KEY`.

Future multi-account deployment:

- OAuth install flow.
- Token encryption before storage.
- Token refresh job.
- Audit table for token refresh outcomes.

### Data Retention

Default retention:

- `webhook_events`: 30 days.
- `deliveries`: 90 days.
- `contact_states`: 180 days or until campaign deletion.

Deletion behavior:

- Admin can delete a campaign and related state.
- `POST /data-deletion` verifies Meta signed requests, deletes matching user rows, and returns a confirmation URL/code.
- Cron deletes old operational rows on the retention schedule.

### Messaging Compliance

Rules:

- No cold DM.
- Only react to user-initiated events such as comments or DM interactions.
- Respect Meta messaging windows and private reply limits.
- Do not send repeated identical messages to the same user for the same trigger.
- Do not promise guaranteed delivery when Meta rate limits or rejects messages.
- Treat Meta policy/window send errors as terminal failures that need user/operator action, not automatic retries.

### Rate Limiting

Implemented application-side controls:

- Global outbound Meta send/read buckets using `outbound_rate_limits`.
- Per user: one public comment reply per campaign.
- Per user: one final delivery per campaign.
- Stale `processing` deliveries are marked `send_status_unknown` for manual reconciliation instead of being requeued automatically.
- Per Meta API response: back off on `429`.
- Per admin IP: cap writes to admin endpoints.

### Error Redaction

Redact token-like strings before returning or storing upstream errors:

- `IGAA...`
- `access_token=...`
- `appsecret_proof=...`
- `Bearer ...`
- common secret field names such as `admin_token`, `app_secret`, and `client_secret`

### Prompt Injection and AI Safety

AI is not required for MVP. If enabled:

- Do not pass access tokens, app secrets, or raw webhook headers into AI prompts.
- Use a fixed system prompt that only transforms approved campaign content.
- Keep generated output under a configured length.
- Store the exact generated message sent to the user.
- Use static delivery for App Review demo.

## Compliance Artifacts

Before App Review, prepare:

- Privacy Policy page.
- Terms page.
- Data Deletion Instructions page.
- Screencast showing permission usage.
- Test Instagram account and test content.
- Clear explanation of why comments and messages are required.

## Operational Safety

- Set Cloudflare usage alerts.
- Keep Meta API version pinned.
- Monitor Meta API error codes.
- Build a kill switch: disable all campaigns with one admin action.
- Keep `AUTOMATION_ENABLED` as a global kill switch.
- Keep a manual fallback: exported list of failed delivery events for human follow-up.
