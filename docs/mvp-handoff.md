# MVP Handoff: Slice 5 Recovery

Baseline: `337f106f83d434b5d45405baead36020e2664bc5`.
Preserve all existing uncommitted Slice 5 work. No commit, push, deployment, or database reset is authorized by this handoff.

## Confirmed remaining work

- [ ] Preserve draft identity and receipt idempotency intent after an ambiguous network response; prove retry does not create a second purchase.
- [ ] Provide a usable UI path to resume, receive, and cancel saved drafts.
- [ ] Scope draft edits, cancellation, and receipt replay to the session location as well as tenant.
- [ ] Make draft edit/cancel transitions safe against concurrent receipt; received records must remain immutable.
- [ ] Recover/create Gentle Dev initialization and acceptance artifacts without inventing completed checks.
- [ ] Verify the existing Slice 5 requirements against implementation after these focused fixes.
- [ ] Run migration/integration tests against the isolated test database and complete final QA.
- [ ] Verify a real local registration/login and supplier -> purchase -> receipt -> stock -> optional cash-out flow.

## Environment

On 2026-09-08, `docker compose ps` could not reach the Docker Desktop Linux engine pipe. No Docker Desktop/backend process was found. PostgreSQL-dependent checks are blocked until Docker is available. Frontend-only regression tests can proceed independently.

## Delivery rules

Use focused tests during changes; do not repeatedly run the full matrix. Preserve valid existing tests and snapshots. Final evidence must distinguish executed results, static inspection, and blocked checks. Do not declare the MVP complete merely because tests pass; acceptance paths must also exist.
