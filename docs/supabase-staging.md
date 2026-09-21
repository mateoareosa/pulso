# Supabase staging database

Pulso keeps PostgreSQL from Docker Compose as the local default. Staging overrides
`DATABASE_URL`; no Supabase credential belongs in the repository.

## Required staging variables

| Variable | Secret | Source |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Copy the exact PostgreSQL connection URI from the Supabase dashboard and store it in the deployment secret manager. Keep the dashboard-required TLS query parameters. |
| `DIRECT_URL` | Yes | Direct PostgreSQL URI used only by one-shot migration and backup jobs; do not inject it into the web app or routine API runtime. |
| `SUPABASE_PROJECT_REF` | No | Copy the staging project reference from Supabase project settings. It is deployment metadata; Prisma does not currently consume it. |

Do not expose a database password, service-role key, or connection URI to the web
application. The NestJS API remains the only application component that connects to
PostgreSQL.

## Manual staging setup

1. In the Supabase staging dashboard, rotate or create a dedicated database password.
2. Copy the dashboard's current Prisma-compatible connection URI.
3. Save the pooler URI as `DATABASE_URL` and the direct URI as `DIRECT_URL` in the
   staging secret manager. Scope `DIRECT_URL` to maintenance jobs when supported. Do
   not create a committed `.env.staging` file.
4. Set `SUPABASE_PROJECT_REF` in the same staging environment.
5. Run `pnpm --filter @pulso/api exec prisma validate` with those variables injected.
   Validation checks configuration only; it does not apply migrations.
6. Review migrations and backups separately before explicitly authorizing any remote
   `prisma migrate deploy`. This setup does not run remote migrations.

Local development remains unchanged:

```powershell
docker compose up -d postgres
Copy-Item .env.example .env
pnpm --filter @pulso/api exec prisma validate
```
