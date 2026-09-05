import { execSync } from 'node:child_process';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://pulso:pulso_test_password@localhost:5433/pulso_test?schema=public';

// Strict validation of target database name
try {
  const parsed = new URL(testDbUrl);
  const dbName = parsed.pathname.replace(/^\//, '').split('?')[0];
  if (dbName !== 'pulso_test') {
    console.error(
      `[Pulso Security Error] prepare-test-db.js rejected database '${dbName}'. Target test database MUST be explicitly 'pulso_test'.`
    );
    process.exit(1);
  }
} catch (e) {
  console.error('[Pulso Security Error] Invalid database URL provided to prepare-test-db.js', e);
  process.exit(1);
}

const maskedUrl = testDbUrl.replace(/:[^:@]+@/, ':****@');
console.log(`[Pulso] Deploying migrations to test database: ${maskedUrl}`);

try {
  execSync('pnpm --filter @pulso/api exec prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: testDbUrl,
    },
  });
  console.log('[Pulso] Test database migrations applied successfully.');
} catch (error) {
  console.error('[Pulso] Failed to prepare test database.', error);
  process.exit(1);
}
