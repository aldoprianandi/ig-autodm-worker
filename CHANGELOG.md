# Changelog

All notable changes to this project are documented in this file.

## Unreleased

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
