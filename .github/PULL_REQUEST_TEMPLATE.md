## Summary

-

## Validation

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm audit --json`
- [ ] `npm run scan:oss`
- [ ] `git diff --check`

## Safety Checklist

- [ ] No real secrets, token fragments, account IDs, media IDs, campaign IDs, or live URLs were added.
- [ ] Official Meta API behavior only.
- [ ] Webhook signature verification remains required for production POSTs.
- [ ] `AUTOMATION_ENABLED` kill switch remains intact.
- [ ] Stored Instagram tokens remain encrypted at rest.
