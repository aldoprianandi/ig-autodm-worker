# Support

This is a self-hosted open-source template.

Use GitHub Discussions for:

- setup and self-hosting questions that do not contain private deployment details.
- ideas that need community feedback before becoming an actionable feature request.
- showcases of generic workflows built from this template.

Use GitHub issues for:

- reproducible bugs with placeholder data.
- documentation gaps.
- scoped feature requests that fit official Meta API behavior.

Do not use GitHub issues for:

- private vulnerability details.
- real tokens, app secrets, account IDs, media IDs, user IDs, or campaign data.
- unofficial Instagram API, scraping, cookie, password, or browser-bot workflows.

For operational emergencies in your own deployment, first set `AUTOMATION_ENABLED=false`, then rotate any potentially exposed secrets.

Run `npm run doctor` for an offline local preflight. It never verifies remote Cloudflare resources, remote secrets, Meta token permissions, or webhook delivery.
