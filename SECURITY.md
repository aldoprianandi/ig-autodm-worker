# Security Policy

## Supported Versions

Security fixes target the `main` branch. This repository is a self-hosted template, so operators should pull fixes and redeploy their own Worker.

## Reporting A Vulnerability

Please do not open public issues for suspected vulnerabilities.

Use GitHub Private Vulnerability Reporting for this repository. If that is unavailable, open a non-sensitive issue asking maintainers to enable private security reporting, but do not include exploit details, token values, account IDs, or screenshots containing secrets.

Useful reports include:

- affected endpoint, file, or behavior.
- impact and realistic attacker capability.
- minimal reproduction steps using placeholders.
- whether any token, app secret, webhook signature, admin credential, or production identifier may have been exposed.

Do not include:

- real access tokens, app secrets, webhook signatures, admin bearer tokens, or session cookies.
- live Instagram account IDs, media IDs, campaign IDs, or personal user data.
- screenshots of Cloudflare, Meta, or Instagram dashboards that contain secrets.

## Operator Response Guidance

If a secret may have leaked:

1. Rotate the affected secret in Cloudflare or Meta.
2. Disable automation with `AUTOMATION_ENABLED=false` if live behavior could be abused.
3. Review D1 operational logs for unexpected sends.
4. Record only that rotation happened; never record the old value.

## Security Boundaries

This project intentionally uses the official Meta API only. Reports that require Instagram passwords, session cookies, scraping, browser bots, unofficial APIs, or mobile session replay are out of scope for this repository.
