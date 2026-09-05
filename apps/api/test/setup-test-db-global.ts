import { execSync } from 'node:child_process';

export default async function globalSetup(): Promise<void> {
  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://pulso:pulso_test_password@localhost:5433/pulso_test?schema=public';

  const parsed = new URL(testDbUrl);
  const dbName = parsed.pathname.replace(/^\//, '').split('?')[0];

  if (dbName !== 'pulso_test') {
    throw new Error(
      `[Security Guard] Test suite aborted: target test database '${dbName}' is not 'pulso_test'.`
    );
  }

  // Ensure migrations are deployed to pulso_test prior to running integration tests
  try {
    execSync('pnpm exec prisma migrate deploy', {
      stdio: 'pipe',
      env: {
        ...process.env,
        DATABASE_URL: testDbUrl,
      },
    });
  } catch (error) {
    console.error('[Pulso API Global Setup] Failed to run test database migrations.', error);
    throw error;
  }
}
