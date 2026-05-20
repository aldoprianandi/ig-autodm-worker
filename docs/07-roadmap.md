# Roadmap

## Phase 0: Foundation

Goal: turn the blueprint into a runnable Worker project.

Deliverables:

- TypeScript Worker project.
- D1 schema.
- Webhook verification.
- Signature verification.
- Unit tests for parsing and signature verification.

Exit criteria:

- Local tests pass.
- Meta dashboard webhook verification succeeds.

## Phase 1: Single Campaign MVP

Goal: one post keyword triggers one DM flow.

Deliverables:

- Campaign table.
- Admin campaign API.
- Comment webhook parser.
- Keyword matcher.
- Opening message sender.
- Delivery records.

Exit criteria:

- Comment `PROMPT` on test media sends one opening message.
- Duplicate webhook does not send another opening message.

## Phase 2: Interactive Delivery

Goal: button tap delivers the final prompt or link.

Deliverables:

- Messaging webhook parser.
- Button payload router.
- Contact state transitions.
- Final delivery sender.
- Follow gate option.

Exit criteria:

- User taps button and receives final delivery.
- Follow gate sends follow request when user is not following.

## Phase 3: Reliability

Goal: survive retries, rate limits, and common Meta failures.

Deliverables:

- Queue for outbound sends.
- Retry policy.
- Rate limit handling.
- Kill switch.
- Logs and metrics.

Exit criteria:

- HTTP `429` and `5xx` are retried.
- Permanent `4xx` errors are stored and not retried.
- Campaign can be disabled instantly.

## Phase 4: Meta App Review

Goal: prepare production access.

Deliverables:

- Privacy Policy page.
- Terms page.
- Data deletion page.
- Screencast.
- App Review notes.

Exit criteria:

- App Review package submitted with a working demo.

## Phase 5: Operator UX

Goal: remove manual API calls for campaign management.

Deliverables:

- Minimal admin UI.
- Campaign analytics page.
- Failed delivery view.
- Export CSV.

Exit criteria:

- Operator can configure and monitor campaigns from browser UI.

## Phase 6: Optional AI

Goal: add usage-based AI without making it core to the funnel.

Deliverables:

- AI feature flag.
- Message variation generator.
- Comment classifier.
- AI usage logging.
- Max token and max cost controls.

Exit criteria:

- Static flow works with AI disabled.
- AI spend can be capped.
