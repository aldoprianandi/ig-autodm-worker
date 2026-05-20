# Product Requirements Document

## Product Name

IG AutoDM Worker

## Problem

Creators and small operators want the common Instagram growth flow:

```text
User comments keyword -> account replies "check DM" -> DM asks for confirmation -> user taps button -> prompt or link is delivered
```

Existing SaaS tools are convenient but expensive or require trusting a third party with Instagram access and audience data. The product should let a technical creator run a small, official-API automation at near-zero idle cost.

## Target User

- Primary: a solo creator or small agency operator with one Instagram Business or Creator account.
- Secondary: a technical builder who may later turn this into an internal tool or SaaS.

## Goals

- Run a comment-to-DM funnel using Meta's official API.
- Keep idle monthly cost at `$0-$5`.
- Avoid password-based Instagram automation.
- Make Meta App Review easier by having clear permission usage and review evidence.
- Keep the first implementation small enough to build, test, and operate alone.

## Non-Goals

- Cold DM campaigns.
- Bulk scraping of followers, commenters, or public profiles.
- Multi-account SaaS billing in the first version.
- Visual no-code flow builder in the first version.
- AI agent conversations as the default path.
- Bypassing Instagram messaging windows or rate limits.

## MVP User Journey

1. Creator configures a campaign:
   - Instagram media ID.
   - Trigger keyword, for example `PROMPT`.
   - Opening DM text.
   - Optional public comment reply text, for example `Sent. Check your DM.`
   - Button title and payload.
   - Prompt or link to deliver.
   - Optional follow gate enabled.
2. Instagram user comments the keyword on the configured media.
3. Meta sends a comment webhook to the backend.
4. Backend verifies webhook authenticity and stores the event idempotently.
5. Backend sends a private reply or opening DM with a button.
6. Backend can post a public reply to the triggering comment after the opening delivery is confirmed sent.
7. User taps the button in Instagram DM. The public safety profile uses one button tap before the final prompt.
8. Meta sends a messaging webhook.
9. Backend checks campaign state and optionally calls the Instagram profile endpoint to inspect `is_user_follow_business`.
10. Backend either:
   - Delivers the prompt or link, or
   - Sends a follow request message and waits for another user action.

## Success Metrics

- `comment_webhook_received_count`: count of valid comment events.
- `trigger_match_rate`: matched comment events divided by valid comment events.
- `opening_message_sent_count`: number of opening DMs/private replies sent.
- `comment_reply_sent_count`: number of public comment acknowledgements sent.
- `button_click_count`: number of postback or quick reply interactions.
- `delivery_success_count`: prompts or links delivered.
- `delivery_failure_count`: failed Meta API sends.
- `duplicate_event_dropped_count`: webhook retries or duplicate comments ignored.
- `manual_intervention_count`: events that require human action.

## Product Principles

- Official API only.
- Single-account first.
- Static content first, AI second.
- Idempotency before polish.
- Clear logs before dashboard.
- Reviewability for Meta before advanced features.

## MVP Release Criteria

- A configured keyword on one post triggers a DM flow end-to-end.
- Duplicate webhooks do not send duplicate messages.
- Webhook signatures are verified.
- Tokens are not committed to the repo.
- Operator can update campaign config without code redeploy.
- Failed Meta sends are logged with request ID and retry state.
- App Review demo can be recorded from the running app.
