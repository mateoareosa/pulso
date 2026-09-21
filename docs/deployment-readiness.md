# Pulso deployment readiness

Checklist for moving the current Supabase staging setup toward a first pilot kiosk.

## Quick path

1. Keep `DATABASE_URL` on the Supabase pooler (6543) for API runtime.
2. Use `DIRECT_URL` (5432) only for Prisma migrations and backups.
3. Provision secrets outside Git; never copy `.env.staging` to the frontend.
4. Run the production smoke test and the authenticated staging flow.
5. Confirm a recent `public` schema backup can be restored locally.

## Secret-manager contract

The hosting provider must inject secrets as environment variables at process or job
startup. Pulso does not fetch secrets from a provider-specific SDK, which keeps the
deployment portable.

| Scope | Variables | Rule |
| --- | --- | --- |
| API runtime | `DATABASE_URL`, `PRODUCT_IMPORT_PREVIEW_SECRET` | Required. Runtime should receive the pooler URL, never the direct maintenance URL. |
| API runtime config | `NODE_ENV=production`, `ALLOWED_ORIGINS`, `COOKIE_SECURE=true` | Required production policy; these values are configuration, not frontend variables. |
| Migration/backup job | `DIRECT_URL` | Inject only into one-shot maintenance jobs. |
| Restore job | `RESTORE_DATABASE_URL`, `RESTORE_CONFIRM_DATABASE` | Inject only for an explicitly approved drill. Remote restore additionally requires `RESTORE_ALLOW_REMOTE=true`. |

- Store no secret in Git, image layers, Compose files, build arguments, frontend
  bundles, logs, or monitoring URLs.
- Grant production and staging separate values and access policies.
- Rotation procedure: add the new value, restart/verify readiness, then revoke the old
  value. Database credential rotation also requires updating both pooler and direct
  URLs where applicable.
- The deployment owner must select the provider secret manager and document who can
  read, rotate, and audit each secret before production.

## Health, readiness, and monitoring hooks

| Endpoint | Meaning | Provider use |
| --- | --- | --- |
| `GET /api/health/live` | Process is alive; no dependency probe | Container liveness/restart check |
| `GET /api/health/ready` | API can execute a database query | Load-balancer readiness and external uptime alert |
| `GET /api/health` | Backward-compatible liveness alias | Existing smoke checks |

Recommended defaults: poll readiness every 60 seconds, fail after 5 seconds, and alert
after three consecutive failures. Route provider alerts to the on-call channel selected
by the deployment owner. Do not put credentials or database URLs in alert payloads.
Alert also on repeated HTTP 5xx, restart loops, database storage above 80%, and backup
job failure. Exact thresholds and notification destination remain hosting decisions.

## Verification matrix

| Area | Evidence required | Current state |
| --- | --- | --- |
| Schema | `prisma migrate status` reports up to date | Passed on staging |
| Runtime | `/api/health` returns 200 | Passed |
| Auth | Unauthenticated protected route returns 401 | Passed |
| Functional flow | Register → login → product → open cash | Passed with synthetic data |
| Tenant isolation | Cross-tenant reads/writes denied | 19/19 integration tests passed locally |
| Offline | Browser offline state and sync queue tests | 7/7 App tests passed |
| Recovery | `pg_dump --schema=public` and local restore | Passed |

## Backup and recovery

The scripts avoid shell interpolation, do not print connection URLs, back up only the
portable `public` schema, write a SHA-256 checksum, and refuse unsafe defaults.

```powershell
$env:DIRECT_URL = '<injected by secret manager>'
$env:BACKUP_FILE = 'backups/pulso-public-YYYYMMDD.dump'
node scripts/backup-postgres.js

$env:RESTORE_DATABASE_URL = '<injected local drill target>'
$env:RESTORE_CONFIRM_DATABASE = 'pulso_restore_drill'
$env:BACKUP_FILE = 'backups/pulso-public-YYYYMMDD.dump'
node scripts/restore-postgres.js
```

The full Supabase dump also contains Supabase-owned extensions; restoring the Pulso
`public` schema is the portable recovery path for a generic PostgreSQL instance.
Restore scripts intentionally do not use `--clean`: prepare an empty, disposable target
database. Schedule and retention depend on the hosting provider; the minimum release
gate is a successful off-platform backup before every migration and a recorded restore
drill. Never point a drill at production.

## Free-plan guardrails

Verified against official Supabase material on 2026-09-21; re-check immediately before
release because quotas can change:

- 500 MB database size per project; exceeding it can put the database in read-only mode.
- Free projects with low activity over a seven-day period can be paused.
- Two active Free projects per organization.
- Automatic backups and point-in-time recovery are not included.
- Free is appropriate for staging/pilot validation, not an uninterrupted-production SLA.

Sources: [Supabase pricing](https://supabase.com/pricing),
[database size](https://supabase.com/docs/guides/platform/database-size),
[project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), and
[billing FAQ](https://supabase.com/docs/guides/platform/billing-faq).

Upgrade before a kiosk depends on uninterrupted availability, or explicitly accept the
pause, read-only, capacity, recovery, and community-support risks in writing.

## Release gate

- [ ] Production secret manager configured
- [ ] Hosting provider and production service shape selected (Dockerfile is not present yet)
- [ ] API and frontend deployed separately
- [ ] HTTPS and secure cookies enabled
- [ ] Health check and alert configured
- [ ] Backup restore drill recorded
- [ ] Pilot kiosk owner accepts the offline/recovery behavior
