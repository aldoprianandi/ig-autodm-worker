# Contributing

Thanks for helping improve IG AutoDM Worker.

## Where to start

- Try the documented local setup and report the exact step that was unclear, using placeholders.
- Improve an error explanation or the Indonesian quick-start guide.
- Add a regression test for a reproducible edge case before changing runtime behavior.
- Browse [good first issues](https://github.com/aldoprianandi/ig-autodm-worker/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22), or propose a small task in Discussions if none are open.

Tests use synthetic data and mocked Meta calls; running them does not require a live Instagram token. For substantial changes, discuss scope before implementation. A contribution does not need to add a feature to be valuable.

## Local Setup

```bash
npm ci
cp .dev.vars.example .dev.vars
cp wrangler.example.toml wrangler.toml
npm run db:migrate:local
npm run dev
```

Use placeholder or test-only values locally. Do not use live production secrets in fixtures, screenshots, docs, comments, or issues.

## Required Checks

Run before opening a PR:

```bash
npm run typecheck
npm run infra:validate
npm run test:coverage
npm audit --json
npm audit signatures
npm run scan:oss
npm run docs:check
git diff --check
```

## Commit Style

Use Conventional Commits:

- `feat:` for user-facing behavior or operational capability.
- `fix:` for bug fixes, security fixes, and behavior corrections.
- `docs:` for README/runbook/API/deployment documentation.
- `test:` for test-only changes.
- `chore:` for tooling and non-behavioral maintenance.
- `refactor:` for internal restructuring without behavior changes.

Keep subjects short, imperative, and free of secret values or sensitive operational details.

## Safety Rules

- Official Meta API only.
- No Instagram passwords, cookies, scraping, browser bots, Selenium, or private API clients.
- Do not weaken webhook signature verification.
- Do not remove the global automation kill switch.
- Do not bypass encrypted token storage.
- Keep `wrangler.toml`, `.dev.vars`, `.env`, `.wrangler`, and deployment notes private.

## Documentation

Public docs must use placeholders for Worker URLs, app IDs, media IDs, account IDs, tokens, campaign IDs, and user identifiers.
