import { PrismaClient } from '@prisma/client';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://pulso:pulso_test_password@localhost:5433/pulso_test?schema=public';

// Ensure environment uses test database URL during integration test runs
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';

export const testPrisma = new PrismaClient({
  datasourceUrl: TEST_DATABASE_URL,
});

export async function truncateAllTables(): Promise<void> {
  const dbResult = await testPrisma.$queryRaw<Array<{ current_database: string }>>`
    SELECT current_database();
  `;
  const dbName = dbResult[0]?.current_database;
  const allowedTestDatabases = ['pulso_test'];

  if (!dbName || !allowedTestDatabases.includes(dbName)) {
    throw new Error(
      `CRITICAL SECURITY VIOLATION: truncateAllTables cannot truncate database "${dbName}". Truncation is only permitted on: ${allowedTestDatabases.join(', ')}.`
    );
  }

  const tablenames = await testPrisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != '_prisma_migrations';
  `;

  const tables = tablenames.map(({ tablename }) => `"${tablename}"`).join(', ');

  if (tables.length > 0) {
    await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
  }
}
