# Architecture

## High-Level System

```mermaid
flowchart LR
  U["Instagram user"] --> C["Comment or DM interaction"]
  C --> M["Meta Webhooks"]
  M --> W["Cloudflare Worker"]
  W --> S["Signature verifier"]
  S --> R["Event router"]
  R --> D1["Cloudflare D1"]
  R --> Q["Cloudflare Queue"]
  Cron["Cloudflare Cron"] --> Poll["Comment poller"]
  Poll --> D1
  Poll --> Q
  Q --> A["Meta API client"]
  A --> IG["Instagram Messaging API"]
  A --> P["Instagram User Profile API"]
  O["Operator"] --> Admin["Admin API"]
  Admin --> D1
```

## Tech Stack

- Runtime: Cloudflare Workers.
- Language: TypeScript.
- Router: Hono or minimal Worker request router. Hono is preferred for clarity.
- Database: Cloudflare D1.
- Queue: Cloudflare Queues for retryable sends.
- Cron: Cloudflare scheduled trigger every minute for fallback polling and final delivery.
- Secrets: Cloudflare Worker secrets.
- Tests: Vitest with Miniflare-compatible unit tests.
- Optional AI: not enabled in the public template; future feature flag only.

## Component Responsibilities

### `src/index.ts`

Entrypoint. Registers routes:

- `GET /health`
- `GET /webhooks/meta`
- `POST /webhooks/meta`
- `GET /admin/campaigns`
- `POST /admin/campaigns`
- `PATCH /admin/campaigns/:id`
- `DELETE /admin/campaigns/:id`
- `GET /admin/media`
- `GET /admin/media/:mediaId/comments`
- `GET /admin/subscription`
- `POST /admin/subscription`
- `GET /admin/audit-logs`

Also exports:

- `queue`: Cloudflare Queue consumer.
- `scheduled`: one-minute cron handler.

### `src/security/signature.ts`

Verifies Meta `X-Hub-Signature-256` using HMAC SHA-256 and the raw request body.

### `src/meta/webhook.ts`

Parses Meta webhook payloads into normalized internal events:

- `comment.created`
- `message.postback`
- `message.quick_reply`
- `message.text`

### `src/meta/api.ts`

Owns all outbound Meta API calls:

- send private reply or message.
- send public comment replies.
- send button template.
- get user profile fields including `is_user_follow_business`.
- list recent media comments for fallback polling.
- pass Instagram tokens through `Authorization` headers.

### `src/security/redaction.ts`

Redacts token-like strings from upstream error text before responses or storage.

### `src/flows/router.ts`

Campaign and state engine:

- match comment to campaign.
- create or update contact state.
- decide delivery action.
- prevent duplicate delivery.

### `src/db/repository.ts`

D1 access layer. Keeps SQL centralized and testable.

### `src/admin/routes.ts`

Operator API for campaign management and operational checks. Protected by `ADMIN_TOKEN`, rate limited before token comparison, and audit logged.

### `src/queue/consumer.ts`

Processes queued delivery jobs and retries transient Meta failures.

### `src/poller/comments.ts`

Scheduled fallback:

- list latest comments for enabled campaign media.
- route matching comments through the same event router used by webhooks.
- skip comments outside the private reply window.
- queue public comment replies when opening delivery is already `sent` and no public reply delivery exists.
- queue final deliveries only when `AUTO_FINAL_AFTER_OPENING=true` and opening delivery is already `sent` with no final delivery.

## Request Flow: Comment Trigger

```mermaid
sequenceDiagram
  participant User as Instagram user
  participant Meta as Meta Webhook
  participant Worker as Cloudflare Worker
  participant D1 as D1
  participant API as Meta API

  User->>Meta: Comment "PROMPT"
  Meta->>Worker: POST /webhooks/meta comments payload
  Worker->>Worker: Verify signature
  Worker->>D1: Insert webhook event
  Worker->>D1: Find enabled campaign by media_id and keyword
  Worker->>D1: Upsert contact state = commented
  Worker->>API: Send opening DM/private reply
  API-->>Worker: message_id
  Worker->>D1: Store delivery status = sent
  Worker-->>Meta: 200 OK
```

## Request Flow: Button Confirmation

```mermaid
sequenceDiagram
  participant User as Instagram user
  participant Meta as Meta Webhook
  participant Worker as Cloudflare Worker
  participant D1 as D1
  participant API as Meta API

  User->>Meta: Tap button
  Meta->>Worker: POST /webhooks/meta messaging payload
  Worker->>Worker: Verify signature
  Worker->>D1: Insert webhook event
  Worker->>D1: Load campaign and contact state
  opt Campaign has another DM step
    Worker->>D1: Queue button_step delivery
    Worker->>API: Send next button message
  end
  Worker->>API: Get user profile follow fields
  alt User follows business
    Worker->>API: Send final prompt
    Worker->>D1: state = delivered
  else User does not follow
    Worker->>API: Send follow request
    Worker->>D1: state = follow_requested
  end
  Worker-->>Meta: 200 OK
```

## Request Flow: Fallback Comment Polling

```mermaid
sequenceDiagram
  participant Cron as Cloudflare Cron
  participant Worker as Cloudflare Worker
  participant API as Meta API
  participant D1 as D1
  participant Q as Queue

  Cron->>Worker: scheduled event
  Worker->>API: List comments for enabled campaign media
  Worker->>Worker: Filter by keyword and age window
  Worker->>D1: Insert comment event idempotently
  Worker->>Q: Queue opening delivery when needed
  Worker->>D1: Find opening sent without public comment reply
  Worker->>Q: Queue public comment reply fallback
  opt AUTO_FINAL_AFTER_OPENING=true
    Worker->>D1: Find opening sent without final
    Worker->>Q: Queue final delivery fallback when flag enabled
  end
```

## Deployment Shape

Initial deployment:

- One Worker project.
- One D1 database.
- One Queue.
- One Meta app.
- One Instagram account token stored as Worker secret.
- One scheduled cron trigger.

Future deployment:

- OAuth installation flow for multiple owned accounts.
- Encrypted token storage per account.
- Dedicated admin UI.

## Key Design Decisions

### Decision 1: Official Meta API Only

Reason: account safety and reviewability matter more than saving a few hours.

### Decision 2: Single Account First

Reason: multi-account support adds OAuth, tenant isolation, billing, token vaulting, and support obligations. None of that is needed to validate the funnel.

### Decision 3: Static Delivery First

Reason: comment-to-DM lead magnet flows do not need AI for the core value. AI can be added after the funnel proves useful.

### Decision 4: D1 Over KV for State

Reason: relational uniqueness constraints are useful for idempotency and delivery records. KV can still be used later for hot campaign config caching.

### Decision 5: Queue for Outbound Sends

Reason: Meta can retry webhooks if the backend is slow. Accept quickly, store intent, and send through a retryable path.

### Decision 6: Fallback Final Delivery

Reason: Meta message webhooks can be delayed or unavailable during setup. Single-step campaigns can optionally queue final content after an opening delivery is confirmed sent, but this fallback is disabled by default so App Review demos remain user-triggered.

### Decision 7: Public Comment Reply After Opening

Reason: many comment-to-DM flows use a visible comment-thread acknowledgement such as `Sent. Check your DM.`. The Worker queues this only after the opening private reply is marked `sent`, and the `comment_reply` delivery key prevents repeated replies to the same campaign/user pair.
