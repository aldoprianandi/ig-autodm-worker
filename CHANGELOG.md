# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Fixed

- Bounded fallback polling to 10 media per minute, with stable rotation and isolated media failures.
- Protected uncertain sends from ordinary retries and preserved completed delivery evidence.
- Capped retryable follow-status failures and corrected follow-gate/postback edge cases.
- Replaced combinatorial fuzzy matching with augmenting-path token assignment.

### Added

- Recovery indexes, real D1 read-cost regression tests, and scheduled-handler tests.
- An Indonesian quick-start guide and local documentation-link validation.

### Documentation

- Reorganized the README around setup, suitability, and operating limits.
- Updated contribution guidance and D1 quota troubleshooting.

### Upgrade notes

- Apply pending migrations, including `0016_delivery_recovery_indexes.sql`, before deploying.
- Fallback coverage now takes ceil(enabled media / 10) minutes; maintain functioning webhooks for busy posts.
- Reconcile `send_status_unknown` with Meta before considering a manual resend.

## 0.2.0 - 2026-07-20

### Added

- Offline `npm run doctor` checks for local setup readiness and accidental private-file tracking without printing configuration values.

### Changed

- Localized the browser admin console in English and surfaced ambiguous delivery states that require manual reconciliation.
- Keyword matching now uses token boundaries and requires every token in a multi-word keyword.
- Every configured DM step and the final delivery require fresh user interaction by default.
- Duplicate or recovered queue jobs preserve terminal delivery evidence instead of overwriting sent states.
- Admin authentication, request-body limits, CSRF rotation, Turnstile verification, CI, and dependency tooling are hardened.

### Operator Notes

- Apply the new `0015` migration with `npm run db:migrate:remote` before deploying this release.
- Review stricter keyword and DM-step behavior before enabling existing campaigns.
- Keep `AUTOMATION_ENABLED=false` for the first controlled deployment check.
- This repository is a self-hosted template with a private npm package; no npm registry publication is expected.

## 0.1.0 - 2026-05-21

- Initial public release of the single-account Cloudflare Worker template.
