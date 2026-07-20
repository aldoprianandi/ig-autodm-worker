# Feature Matrix

## Current Features

| Feature | Status | Notes |
| --- | --- | --- |
| Official Meta Instagram API | Live | No scraping, password, session cookie, private API, or browser bot. |
| Offline setup doctor | Live | `npm run doctor` checks local runtime, bindings, key names, safety flags, and private-file tracking without printing values or contacting Cloudflare or Meta. |
| One connected Instagram account | Live | This template is designed for one Instagram Business or Creator account per deployment. |
| Comment keyword trigger | Live | Campaigns match by exact media ID plus configured keyword; multi-word keywords require every token, with small typo tolerance. |
| Opening private reply | Live | Sent through Instagram Messaging API using `recipient.comment_id`. |
| Public comment acknowledgement | Live | Cron queues `comment_reply` after opening DM delivery is marked `sent`; duplicate keys prevent repeat replies. |
| Message variants | Live | Opening DM and public comment replies support per-campaign variant pools with deterministic random selection per user/comment. Intermediate DM step variants are dormant while multi-step saves are locked off. |
| Reusable variant template library | Live | Opening DM and public reply templates are stored in D1, searchable in `/admin-ui`, and saved in bulk from the dashboard. |
| Button template | Live | Sent in opening message; the public safety profile uses a postback button that queues the final prompt/link DM after user tap. |
| Multi-step DM buttons | Locked off | Campaign saves force an empty step list while the public template stays to one button tap before the final DM. |
| Automatic final delivery fallback | Feature-flagged | Disabled by default. Set `AUTO_FINAL_AFTER_OPENING=true` only when accepting the Meta compliance tradeoff. |
| Comment polling fallback | Live | Cron checks enabled campaign media every minute. |
| Private reply age guard | Live | Poller skips comments older than 7 days. |
| Follow gate | Live | Standard postback campaigns can require the user to follow before final delivery; the follow instruction text and retry button title are campaign-customizable, with `READY` as a text fallback. |
| Duplicate suppression | Live | Uses `webhook_events` and `deliveries` unique keys. |
| Global kill switch | Live | `AUTOMATION_ENABLED` must equal `true` for routing and queue sends. |
| Admin API | Live | Bearer auth for scripts, DB-backed browser sessions, rate limit, audit log. |
| Browser admin console | Live | `/admin-ui` logs in through `/admin/session` with username, password, and admin security key, then reads/edits campaigns through session + CSRF protected APIs. |
| Refresh-safe browser session | Live | `GET /admin/session` resumes a valid HttpOnly cookie session and rotates CSRF after page refresh; protected data loads through `/admin/bootstrap` after CSRF rotation. |
| Guided campaign builder | Live | Recent Instagram posts can be selected in the dashboard; campaign setup uses a left Auto-DM list, center editor, sticky save/activation actions, and right follower preview/checklist. |
| Instagram-style campaign preview | Live | `/admin-ui` renders a local preview of public comment reply and multi-step DM bubbles from the current form without calling Instagram. |
| Draft vs activation | Live | New campaigns save as draft first; activation is a separate confirmed action with validation. |
| Operational dashboard | Live | Counts campaigns/state/deliveries, token source, and runtime limits without token values; `send_status_unknown` failures are counted separately and surfaced as needing manual review. |
| Encrypted token vault | Live | Refreshed Instagram tokens are encrypted in D1 with `TOKEN_ENCRYPTION_KEY`. |
| Automatic token refresh | Live | Cron refreshes long-lived Instagram tokens when due. |
| Outbound send limiter | Live | Queue consumer rate-limits local Meta sends before calling Graph. |
| Delivery recovery | Live | Cron re-enqueues stale `queued`/`retrying` rows; stale `processing` rows become `send_status_unknown` for manual reconciliation to avoid duplicate sends after an accepted Meta call. |
| Operational cleanup | Live | Cron removes old webhook, delivery, contact, audit, event, and limiter rows in bounded batches. |
| Meta app legal pages | Live | `/privacy`, `/terms`, `/data-deletion`; POST deletion callback verifies Meta signed requests. |
| Upstream error redaction | Live | Token-like strings are redacted before responses/storage. |

## Admin Features

| Feature | Endpoint | Status |
| --- | --- | --- |
| List campaigns | `GET /admin/campaigns` | Live |
| Create/update campaign | `POST /admin/campaigns` | Live |
| Enable/disable campaign | `PATCH /admin/campaigns/:id` | Live |
| Delete campaign data | `DELETE /admin/campaigns/:id` | Live |
| List media | `GET /admin/media` | Live |
| List media comments | `GET /admin/media/:mediaId/comments` | Live |
| Read webhook subscription | `GET /admin/subscription` | Live |
| Update webhook subscription | `POST /admin/subscription` | Live |
| Audit logs | `GET /admin/audit-logs` | Live |
| Operational dashboard | `GET /admin/dashboard` | Live |
| Admin bootstrap | `GET /admin/bootstrap` | Live |
| Variant template library | `GET/POST /admin/variant-templates`, `POST /admin/variant-templates/bulk` | Live |
| Browser session resume | `GET /admin/session` | Live |
| Browser admin console | `GET /admin-ui` | Live |

## Security Features

| Control | Status | Implementation |
| --- | --- | --- |
| Webhook HMAC verification | Live | `src/security/signature.ts` |
| Signed malformed JSON handling | Live | `src/index.ts` returns controlled `400`. |
| Admin bearer auth | Live | `src/admin/routes.ts` |
| Admin rate limit before token check | Live | `src/admin/routes.ts`, `admin_rate_limits` table |
| Admin audit log | Live | `admin_audit_logs` table |
| Admin actor hashing | Live | IP-derived actor keys use HMAC with the admin token; rate-limited requests are not audit-log spammed. |
| Admin UI security headers | Live | nonce-scoped CSP, no-store, anti-frame, nosniff, no-referrer |
| Admin session resume CSRF rotation | Live | Refresh keeps the HttpOnly cookie but rotates the CSRF token before loading protected dashboard data or doing any `/admin/*` writes. |
| Optional Turnstile admin login | Ready | When `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are configured, `/admin-ui` renders Cloudflare Turnstile and `/admin/session` verifies Siteverify before creating a session. |
| Token redaction | Live | `src/security/redaction.ts` |
| Access token not in Graph URLs | Live | Meta calls use Authorization headers. |
| Encrypted token at rest | Live | `src/security/secret-box.ts`, `instagram_tokens` table |
| Local outbound send limit | Live | `outbound_rate_limits` table |
| D1 prepared statements | Live | `src/db/repository.ts` |
| Dependency audit | Clean | `npm audit` has no reported vulnerabilities at last review. |

## Known Limitations

- The public template is single-account. Multi-account OAuth, tenant isolation, billing, and token vaulting are intentionally out of scope.
- If button postback webhooks do not arrive reliably, automatic final delivery can be enabled with `AUTO_FINAL_AFTER_OPENING=true`, but the safer default is off.
- No AI generation is enabled by default. Prompt delivery is static text/link.
- Browser admin UI is intentionally single-operator; no user management or multi-account tenant UI yet.

## Future Work

- Cloudflare Access or WAF/IP allowlisting in front of `/admin/*`.
- Delivery inspection view in the browser admin console.
- Token revocation/rotation helper workflow for emergency manual resets.
- Optional OAuth install flow for multi-account support.
- Optional AI generation behind a strict feature flag.
