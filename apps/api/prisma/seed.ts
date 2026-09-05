import { PrismaClient } from '@prisma/client';
import { hashPassword, normalizeEmail } from '../src/auth/security.utils.js';
import { generateSlug, resolveSlugCollision } from '../src/tenants/slug.utils.js';

export interface SeedOptions {
  email?: string;
  password?: string;
  name?: string;
  businessName?: string;
  locationName?: string;
  nodeEnv?: string;
}

export interface SeedResult {
  skipped: boolean;
  user?: { id: string; email: string; name: string };
  tenant?: { id: string; name: string; slug: string };
  location?: { id: string; name: string };
  membership?: { id: string; role: string };
}

/**
 * Executes development database seeding inside an atomic interactive transaction.
 * Strictly forbidden in production environments.
 */
export async function runSeed(
  prisma: PrismaClient,
  options: SeedOptions = {}
): Promise<SeedResult> {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  if (nodeEnv === 'production') {
    throw new Error('Database seeding is strictly forbidden in production environments.');
  }

  const email = options.email ?? process.env.DEV_SEED_EMAIL ?? 'operador@pulso.dev';
  const password = options.password ?? process.env.DEV_SEED_PASSWORD;
  const name = options.name ?? process.env.DEV_SEED_NAME ?? 'Operador Mostrador';
  const businessName =
    options.businessName ?? process.env.DEV_SEED_BUSINESS_NAME ?? 'Kiosco Demostración';
  const locationName = options.locationName ?? process.env.DEV_SEED_LOCATION_NAME ?? 'Central';

  if (!password) {
    throw new Error(
      'DEV_SEED_PASSWORD environment variable is required to run the development seed. Please configure it in your .env file.'
    );
  }

  const normalized = normalizeEmail(email);

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({
      where: { normalizedEmail: normalized },
    });

    if (existing) {
      return { skipped: true };
    }

    const user = await tx.user.create({
      data: {
        email,
        normalizedEmail: normalized,
        name,
        passwordHash: await hashPassword(password),
      },
    });

    const baseSlug = generateSlug(businessName);
    let candidateSlug = baseSlug;
    let attempt = 1;

    while (true) {
      const existingTenant = await tx.tenant.findUnique({
        where: { slug: candidateSlug },
        select: { id: true },
      });

      if (!existingTenant) {
        break;
      }

      candidateSlug = resolveSlugCollision(baseSlug, attempt);
      attempt++;
    }

    const tenant = await tx.tenant.create({
      data: {
        name: businessName,
        slug: candidateSlug,
      },
    });

    const location = await tx.location.create({
      data: {
        tenantId: tenant.id,
        name: locationName,
      },
    });

    const membership = await tx.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        role: 'OWNER',
      },
    });

    return {
      skipped: false,
      user: { id: user.id, email: user.email, name: user.name },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      location: { id: location.id, name: location.name },
      membership: { id: membership.id, role: membership.role },
    };
  });
}

export async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await runSeed(prisma);
    if (result.skipped) {
      console.log('[Seed] User already exists. Skipping.');
    } else {
      console.log('[Seed] Development commerce seeded successfully.');
      console.log(`[Seed] Tenant: ${result.tenant?.name} (${result.tenant?.slug})`);
      console.log('Login via the web interface (/login) with the configured credentials.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Execute when invoked directly via CLI (tsx prisma/seed.ts)
const isDirectExecution =
  process.argv[1] && (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'));

if (isDirectExecution) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
