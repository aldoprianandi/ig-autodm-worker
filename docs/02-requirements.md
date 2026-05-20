# Requirements

## Assumptions

- The Instagram account is Business or Creator.
- The first version is for one Instagram account owned by the operator.
- The backend runs on Cloudflare Workers.
- Campaign content is static text or links.
- AI generation is optional and disabled by default.
- Meta API permissions and product names may change; the implementation keeps the Meta integration isolated.

## Functional Requirements

### FR1: Webhook Verification

The backend must respond to Meta webhook verification requests.

Acceptance criteria:

- `GET /webhooks/meta` returns the `hub.challenge` value when `hub.verify_token` matches the configured secret.
- Requests with an invalid verify token return HTTP `403`.

### FR2: Webhook Signature Verification

The backend must verify incoming webhook signatures before processing events.

Acceptance criteria:

- `POST /webhooks/meta` validates `X-Hub-Signature-256`.
- Invalid signatures return HTTP `401`.
- Valid signatures are processed.

### FR3: Comment Trigger Detection

The backend must detect configured keywords in comments.

Acceptance criteria:

- Matching is case-insensitive.
- Keyword matching is scoped to configured `media_id`.
- Events from unknown media are ignored and logged as ignored.
- The same Meta comment ID is processed once.

### FR4: Opening Message Delivery

The backend must send an opening message after a matched comment.

Acceptance criteria:

- The opening message contains one action button or quick reply.
- Campaigns may define up to 3 additional DM button steps before the final prompt.
- The message references the matched campaign.
- Meta API errors are stored with status code, error code, and error message.

### FR5: Button/Postback Handling

The backend must process messaging postbacks, quick replies, or matching button-title text fallback.

Acceptance criteria:

- The payload maps back to a campaign.
- Intermediate step interactions queue the next configured button step.
- The user state changes from `commented` or a button-step state to `confirmed` when the final prompt is requested.
- The final prompt or link is sent only after user interaction.

### FR6: Follow Gate

The backend must optionally gate delivery based on whether the user follows the business account.

Acceptance criteria:

- If follow gate is disabled, delivery proceeds after confirmation.
- If follow gate is enabled and `is_user_follow_business` is true, delivery proceeds.
- If follow gate is enabled and `is_user_follow_business` is false, the backend sends a follow request message.
- The gate can be checked again when the user sends or taps a follow-up interaction.

### FR7: Campaign Configuration

The operator must be able to manage campaign config without changing source code.

Acceptance criteria:

- Campaigns are stored in D1.
- Admin endpoints are protected with an admin bearer token.
- Campaigns can be created, listed, enabled, disabled, and updated.
- Campaigns can optionally configure a public comment acknowledgement sent after the opening DM is confirmed sent.

### FR8: Idempotency

The backend must avoid duplicate sends caused by webhook retries.

Acceptance criteria:

- Incoming Meta event IDs or comment IDs are stored in `webhook_events`.
- Reprocessing an existing event returns HTTP `200` without sending another message.
- Message delivery rows are unique by `campaign_id`, `ig_user_id`, and `delivery_type`.

### FR9: Retry Queue

The backend must retry transient Meta API failures.

Acceptance criteria:

- HTTP `429` and `5xx` responses are queued with exponential backoff.
- Permanent `4xx` responses are not retried, except rate limits.
- Retry attempts are capped.

### FR10: Audit Logging

The backend must record enough events to debug and prepare Meta App Review evidence.

Acceptance criteria:

- Logs include campaign ID, Meta event type, delivery type, and request ID.
- Logs never include access tokens, app secret, or raw authorization headers.

## Non-Functional Requirements

- Reliability: accept webhooks quickly and process sends asynchronously when possible.
- Security: no Instagram credentials are stored; OAuth or long-lived API token only.
- Privacy: retain user-scoped IDs only as long as needed for automation and audit.
- Cost: stay within Cloudflare free tier for early usage.
- Maintainability: isolate Meta API calls in one module.
- Testability: all parser, router, signature, and state transition logic has unit tests.

## Data Model

### campaigns

- `id`: text primary key.
- `name`: text.
- `media_id`: text.
- `keyword`: text.
- `opening_text`: text.
- `button_title`: text.
- `button_payload`: text.
- `dm_steps`: JSON text for optional extra button messages.
- `delivery_text`: text.
- `follow_gate_enabled`: integer boolean.
- `enabled`: integer boolean.
- `created_at`: ISO timestamp.
- `updated_at`: ISO timestamp.

### contact_states

- `id`: text primary key.
- `campaign_id`: text.
- `ig_user_id`: text.
- `username`: text nullable.
- `state`: text enum: `commented`, `opened`, `confirmed`, `follow_requested`, `delivered`, `failed`.
- `last_comment_id`: text nullable.
- `last_message_id`: text nullable.
- `created_at`: ISO timestamp.
- `updated_at`: ISO timestamp.

### webhook_events

- `event_id`: text primary key.
- `event_type`: text.
- `campaign_id`: text nullable.
- `ig_user_id`: text nullable.
- `raw_hash`: text.
- `processed_at`: ISO timestamp.

### deliveries

- `id`: text primary key.
- `campaign_id`: text.
- `ig_user_id`: text.
- `delivery_type`: text enum: `opening`, `comment_reply`, `opening_failure_reply`, `button_step`, `final`.
- `status`: text enum: `queued`, `sent`, `failed`, `retrying`.
- `meta_message_id`: text nullable.
- `error_code`: text nullable.
- `error_message`: text nullable.
- `attempt_count`: integer.
- `created_at`: ISO timestamp.
- `updated_at`: ISO timestamp.

## Permission Requirements

Preferred 2026 path: Instagram API with Instagram Login.

- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`

Fallback path if the account or review flow requires Facebook Login:

- `instagram_basic`
- `instagram_manage_comments`
- `instagram_manage_messages`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_metadata`

The implementation must keep permissions documented in the app review playbook and show each permission being used in the screencast.
