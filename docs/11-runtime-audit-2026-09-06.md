# Runtime audit — 2026-09-06

Scope: both runtime repositories, delivery state transitions, scheduled work, D1 read cost, keyword matching, tests, dependencies, and repository guidance. This is a bounded audit, not a guarantee that every bug or production integration has been exercised.

## Fixes

- Preserve completed deliveries when automation/campaigns are disabled; terminate queued jobs whose campaign or public reply configuration is no longer usable.
- Treat send transport failures as `send_status_unknown`: the upstream may have accepted the message. Ordinary interactive/opening retries must not resend these records; reconcile manually with Meta first. Profile reads remain safe to retry.
- Count upstream follow-status failures against the retry budget; local outbound throttling remains exempt.
- Require interaction between intermediate DM steps and before final delivery. Allow a follow-gate retry after the last step; reject malformed numeric postback suffixes.
- Isolate inaccessible media during polling so one failed API request does not abort the remaining media or fallback work.
- Bound fallback polling to 10 media per minute in stable rotating batches. This avoids the Free plan's 50 external subrequest limit and reduces CPU. Coverage takes ceil(media count / 10) minutes; webhook latency is unchanged. Polling still reads only the latest 25 comments per selected media, so high-volume campaigns must rely on functioning webhooks.
- Replace combinatorial fuzzy-token assignment with bounded augmenting-path matching, retaining each repository's existing keyword policy.
- Exercise actual scheduled-handler cadence/kill-switch behavior and actual D1 recovery read counts in regression tests.
- Check the commit range in CI for whitespace errors, instead of checking a clean checkout.

## Evidence

- Synthetic difficult keyword benchmark (12 repeated tokens, six-token keyword): approximately 81 ms before and 0.13 ms after locally. This is matcher-only, not a claim about end-to-end delivery latency. 300 deterministic comparison inputs per repository produced no behavior mismatches.
- D1 regression seeds 4,000 sent deliveries and verifies all three recovery queries together read fewer than 30 rows when there is no work.
- Both suites pass type checking, tests, infrastructure/migration validation, coverage, dependency audit (zero vulnerabilities), package signatures, and whitespace checks. The public repository also passes its OSS data scan.
- Selfhost: 230 tests; public template: 249 tests. Production verification and identifiers belong in the private deployment document, not this public-safe report.

Cloudflare limits reference: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Operational boundaries

- Source fixes should be committed in the repository and deployed from it. Pushing GitHub alone does not deploy this Worker.
- The two local deployment configurations point at the same Worker. Deploy only the private selfhost runtime; do not overwrite it with the public template.
- Existing migration histories differ: private migration 0013 includes columns/indexes split across public 0013–0015. Do not replay old ALTER statements or renumber applied migrations. Recovery indexes are private 0014 / public 0016.
- A healthy HTTP endpoint does not prove cron or queue execution succeeded. Verify scheduled outcomes, CPU budget, D1 reads, and real delivery outcomes separately.
- Do not erase historical delivery/idempotency data to resolve a daily read quota. Apply indexes and control work frequency; only use established retention cleanup.
- Keep HMAC verification, encrypted token storage, admin authentication, CSRF, rate limiting, and the automation kill switch intact.
- Use task-relevant skills only. Repository guidance was updated; global skills were not rewritten.
