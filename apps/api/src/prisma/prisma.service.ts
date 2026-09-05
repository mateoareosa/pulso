import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasourceUrl: process.env.DATABASE_URL,
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : process.env.NODE_ENV === 'test'
            ? []
            : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Helper utility for integration tests to truncate all tables safely
   * preserving the schema. Must only be run in test environments.
   */
  async cleanDatabaseForTesting() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('cleanDatabaseForTesting can only be executed when NODE_ENV=test');
    }

    const dbQuery = await this.$queryRaw<Array<{ current_database: string }>>`
      SELECT current_database();
    `;
    const dbName = dbQuery[0]?.current_database;
    const allowedDatabases = ['pulso_test'];

    if (!dbName || !allowedDatabases.includes(dbName)) {
      throw new Error(
        `CRITICAL SECURITY VIOLATION: cleanDatabaseForTesting cannot truncate database "${dbName}". Truncation is only permitted on: ${allowedDatabases.join(', ')}.`
      );
    }

    const tablenames = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != '_prisma_migrations';
    `;

    const tables = tablenames.map(({ tablename }) => `"${tablename}"`).join(', ');

    if (tables.length > 0) {
      await this.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    }
  }
}
