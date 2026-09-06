# IG AutoDM Worker

[![CI](https://github.com/aldoprianandi/ig-autodm-worker/actions/workflows/ci.yml/badge.svg)](https://github.com/aldoprianandi/ig-autodm-worker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com/)
[![Official Meta API only](https://img.shields.io/badge/Meta%20API-official%20only-blue)](docs/04-security-and-compliance.md)

**Turn an Instagram comment into a DM with the link your audience asked for. Self-hosted, using the official Meta API.**

For creators and developers who want a single-account comment-to-DM workflow on their own Cloudflare infrastructure. No Instagram password, session cookies, scraping, or unofficial APIs.

[Get started](#get-started) · [Setup guide](docs/runbook.md) · [Costs & limits](docs/06-cost-and-ops.md) · [Ask a question](https://github.com/aldoprianandi/ig-autodm-worker/discussions) · [Bahasa Indonesia](docs/README.id.md)

![Admin console with campaign editor, message preview, and readiness checklist](assets/admin-ui-preview.png)

*Admin console preview. Real sending requires your own Cloudflare deployment and configured Meta access; this is not a hosted demo.*

## The workflow

1. Someone comments **GUIDE** on a post you configured.
2. They receive an opening private reply with a button.
3. They tap the button to receive your guide or link.
4. Optionally, a public reply tells them to check their DMs; a follow gate can wait for a confirmed follow before final delivery.

Useful for resource links, product information, and creator campaign responses. The service does not cold-message arbitrary users or automatically target every post.

## What is included?

- **Campaign console:** guided editor, message preview, reusable templates, and an operational dashboard.
- **Keyword matching:** typo tolerance; multi-word keywords require every token, in any order.
- **Reliable delivery plumbing:** signed webhooks, D1 deduplication, a delivery queue, bounded retries, and stale-job recovery.
- **Message options:** deterministic variants, optional public replies, and an optional follow gate.
- **Operator controls:** automation kill switch, outbound rate limiter, encrypted stored tokens, and scheduled refresh.
- **Bounded fallback polling:** up to 10 media per minute, with delivery recovery every five minutes and maintenance hourly.

See the [feature matrix](docs/10-feature-matrix.md) for supported behavior and limitations.

## Is it a fit?

| A good fit | Not included |
| --- | --- |
| One Instagram Business or Creator account | Multi-account SaaS or a hosted service |
| You can manage a Meta app and Cloudflare deployment | One-click setup without Meta configuration |
| You want source access and control over your data | Guaranteed delivery, App Review approval, or unlimited free usage |
| User-triggered comment-to-DM campaigns | Scraping, cold DMs, or private Instagram APIs |

The template uses a Meta-generated account token and does **not** ship an OAuth callback route. Multi-step configuration is locked off in the public template, although the flow engine supports interactive steps. Automatic final delivery is opt-in; keep `AUTO_FINAL_AFTER_OPENING` unset or false for the default interaction-driven flow.

## Get started

You need Node.js 22+, npm 11.8.0 or compatible, and Git. Remote sending also needs a Cloudflare account, a Meta developer app, and suitable Instagram API access for a Business or Creator account. This project is not affiliated with or endorsed by Meta or Cloudflare.

### 1. Get the source

Fork this repository if you want your own GitHub copy, or clone it:

```bash
git clone https://github.com/aldoprianandi/ig-autodm-worker.git
cd ig-autodm-worker
npm ci
cp .dev.vars.example .dev.vars
cp wrangler.example.toml wrangler.toml
```

Edit the copied files for your local test setup. Keep `AUTOMATION_ENABLED=false`; never commit private configuration.

### 2. Check your local setup

```bash
npm run doctor
npm run db:migrate:local
npm run dev
```

The doctor is offline and read-only. It reports setup status without printing values; it does not verify remote tokens, permissions, or webhook delivery.

Open `http://localhost:8787/admin-ui` for the console, or check `http://localhost:8787/health`. Local health confirms the Worker starts, not that Instagram sending works.

### 3. Connect and deploy

Follow the [deployment runbook](docs/runbook.md#cloudflare-setup) to create D1 and queues, configure secrets, apply remote migrations, and deploy. Use the [Meta setup and review guide](docs/05-meta-app-review-playbook.md) for the platform-specific prerequisites.

Keep automation disabled until health, webhook verification, admin login, and a draft campaign pass. Then enable only one test campaign and verify comment → opening DM → user interaction → final delivery.

## Costs and limits

Self-hosting has no project subscription fee, but infrastructure usage and your operating time are not unlimited. Free-tier suitability depends on daily traffic, query scans, queue operations, and retries—not just monthly audience size.

Fallback polling reads the latest 25 comments per selected media. A full rotation takes `ceil(enabled media / 10)` minutes; high-volume campaigns need working webhooks. A quota reset or an HTTP health check is not proof that deliveries recovered.

Read [costs, D1 quota recovery, and troubleshooting](docs/06-cost-and-ops.md) before enabling a campaign.

## Help improve it

- [Ask setup questions or share a workflow](https://github.com/aldoprianandi/ig-autodm-worker/discussions).
- [Report a reproducible bug or documentation gap](https://github.com/aldoprianandi/ig-autodm-worker/issues/new/choose), using placeholder data only.
- [Start contributing](CONTRIBUTING.md#where-to-start): documentation and tests are welcome; you do not need a live Instagram token to run the test suite.
- Report vulnerabilities through the [security policy](SECURITY.md), not public issues.

If the project is useful, consider starring it to bookmark it and show support. Specific feedback and reproducible fixes are equally welcome.

## Documentation

| Goal | Start here |
| --- | --- |
| Install and operate | [Runbook](docs/runbook.md) · [Support](SUPPORT.md) |
| Understand costs and failure modes | [Cost & operations](docs/06-cost-and-ops.md) |
| Configure Meta | [App Review playbook](docs/05-meta-app-review-playbook.md) |
| Explore the API and implementation | [API reference](docs/09-api-reference.md) · [Architecture](docs/03-architecture.md) |
| Check capabilities and changes | [Feature matrix](docs/10-feature-matrix.md) · [Changelog](CHANGELOG.md) · [Roadmap](docs/07-roadmap.md) |
| Understand security boundaries | [Security & compliance](docs/04-security-and-compliance.md) · [Runtime audit](docs/11-runtime-audit-2026-09-06.md) |
| Contribute responsibly | [Contributing](CONTRIBUTING.md) · [Code of conduct](CODE_OF_CONDUCT.md) |

## License

[MIT](LICENSE).
