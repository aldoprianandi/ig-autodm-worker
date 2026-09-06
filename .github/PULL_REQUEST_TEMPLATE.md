## Summary

-

## Validation

- [ ] `npm run typecheck`
- [ ] `npm run infra:validate`
- [ ] `npm run test:coverage`
- [ ] `npm audit --json`
- [ ] `npm audit signatures`
- [ ] `npm run scan:oss`
- [ ] `npm run docs:check`
- [ ] `git diff --check`

## Safety Checklist

- [ ] No real secrets, token fragments, account IDs, media IDs, campaign IDs, or live URLs were added.
- [ ] Official Meta API behavior only.
- [ ] Webhook signature verification remains required for production POSTs.
- [ ] `AUTOMATION_ENABLED` kill switch remains intact.
- [ ] Stored Instagram tokens remain encrypted at rest.
