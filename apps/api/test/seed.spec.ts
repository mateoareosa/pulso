import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { testPrisma, truncateAllTables } from './setup-test-db.js';
import { runSeed } from '../prisma/seed.js';

describe('Seed Script Atomicity & Slug Derivation', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  it('creates user, tenant, location, and membership atomically with derived slug', async () => {
    const result = await runSeed(testPrisma, {
      email: 'seed-owner@pulso.dev',
      password: 'validSeedPassword123!',
      name: 'Seed Owner',
      businessName: 'Kiosco El Cóndor',
      locationName: 'Sucursal Central',
      nodeEnv: 'development',
    });

    expect(result.skipped).toBe(false);
    expect(result.user?.email).toBe('seed-owner@pulso.dev');
    expect(result.tenant?.slug).toBe('kiosco-el-condor');
    expect(result.location?.name).toBe('Sucursal Central');
    expect(result.membership?.role).toBe('OWNER');

    // Verify persisted records in PostgreSQL
    const userInDb = await testPrisma.user.findUnique({
      where: { normalizedEmail: 'seed-owner@pulso.dev' },
    });
    expect(userInDb).not.toBeNull();
    expect(userInDb?.name).toBe('Seed Owner');

    const tenantInDb = await testPrisma.tenant.findUnique({
      where: { slug: 'kiosco-el-condor' },
    });
    expect(tenantInDb).not.toBeNull();

    const locationInDb = await testPrisma.location.findFirst({
      where: { tenantId: tenantInDb!.id },
    });
    expect(locationInDb?.name).toBe('Sucursal Central');

    const membershipInDb = await testPrisma.tenantMembership.findFirst({
      where: { tenantId: tenantInDb!.id, userId: userInDb!.id },
    });
    expect(membershipInDb?.role).toBe('OWNER');
  });

  it('resolves slug collision automatically when multiple seeds share the same business name', async () => {
    const first = await runSeed(testPrisma, {
      email: 'first@pulso.dev',
      password: 'password123',
      businessName: 'Kiosco San Telmo',
      nodeEnv: 'development',
    });
    expect(first.tenant?.slug).toBe('kiosco-san-telmo');

    const second = await runSeed(testPrisma, {
      email: 'second@pulso.dev',
      password: 'password123',
      businessName: 'Kiosco San Telmo',
      nodeEnv: 'development',
    });
    expect(second.tenant?.slug).toBe('kiosco-san-telmo-1');
  });

  it('skips execution gracefully if the user already exists', async () => {
    await runSeed(testPrisma, {
      email: 'existing@pulso.dev',
      password: 'password123',
      businessName: 'Kiosco Original',
      nodeEnv: 'development',
    });

    const secondAttempt = await runSeed(testPrisma, {
      email: 'EXISTING@PULSO.DEV',
      password: 'password123',
      businessName: 'Kiosco Duplicado',
      nodeEnv: 'development',
    });

    expect(secondAttempt.skipped).toBe(true);
    expect(secondAttempt.user).toBeUndefined();

    // Ensure no duplicate tenant was created
    const count = await testPrisma.tenant.count();
    expect(count).toBe(1);
  });

  it('strictly rejects execution in production environments', async () => {
    await expect(
      runSeed(testPrisma, {
        email: 'prod@pulso.dev',
        password: 'password123',
        nodeEnv: 'production',
      })
    ).rejects.toThrow('Database seeding is strictly forbidden in production environments.');
  });

  it('throws descriptive error if DEV_SEED_PASSWORD is empty or undefined', async () => {
    const originalEnvPassword = process.env.DEV_SEED_PASSWORD;
    delete process.env.DEV_SEED_PASSWORD;

    try {
      await expect(
        runSeed(testPrisma, {
          email: 'test@pulso.dev',
          password: '',
          nodeEnv: 'development',
        })
      ).rejects.toThrow('DEV_SEED_PASSWORD environment variable is required');
    } finally {
      if (originalEnvPassword) {
        process.env.DEV_SEED_PASSWORD = originalEnvPassword;
      }
    }
  });

  it('rolls back all database mutations atomically if an intermediate step fails', async () => {
    // Intercept transaction client to simulate failure during location creation
    const failingPrisma = new Proxy(testPrisma, {
      get(target, prop: keyof typeof testPrisma) {
        if (prop === '$transaction') {
          return async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
            return target.$transaction(async (tx) => {
              const proxiedTx = new Proxy(tx, {
                get(txTarget, txProp: keyof typeof tx) {
                  if (txProp === 'location') {
                    return {
                      ...txTarget.location,
                      create: () =>
                        Promise.reject(
                          new Error('Simulated atomic failure during location creation')
                        ),
                    };
                  }
                  return Reflect.get(txTarget, txProp);
                },
              });
              return fn(proxiedTx as Prisma.TransactionClient);
            });
          };
        }
        return Reflect.get(target, prop);
      },
    });

    await expect(
      runSeed(failingPrisma, {
        email: 'atomic-rollback@pulso.dev',
        password: 'password123',
        businessName: 'Kiosco Rollback Test',
        nodeEnv: 'development',
      })
    ).rejects.toThrow('Simulated atomic failure during location creation');

    // Verify complete rollback: neither User nor Tenant must exist in PostgreSQL
    const userInDb = await testPrisma.user.findFirst({
      where: { normalizedEmail: 'atomic-rollback@pulso.dev' },
    });
    expect(userInDb).toBeNull();

    const tenantInDb = await testPrisma.tenant.findFirst({
      where: { slug: 'kiosco-rollback-test' },
    });
    expect(tenantInDb).toBeNull();
  });
});
