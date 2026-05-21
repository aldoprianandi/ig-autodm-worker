# Contributing

Thanks for helping improve IG AutoDM Worker.

## Local Setup

```bash
npm install
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
