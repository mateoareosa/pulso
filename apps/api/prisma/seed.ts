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

    // 1. Seed Categories
    const categoriesData = [
      { name: 'Golosinas', normalizedName: 'golosinas' },
      { name: 'Bebidas', normalizedName: 'bebidas' },
      { name: 'Snacks', normalizedName: 'snacks' },
    ];

    const categoryMap = new Map<string, string>();
    for (const cat of categoriesData) {
      const created = await tx.category.create({
        data: {
          tenantId: tenant.id,
          name: cat.name,
          normalizedName: cat.normalizedName,
          isActive: true,
        },
      });
      categoryMap.set(cat.name.toUpperCase(), created.id);
    }

    // 2. Seed 8 Demo Products with initial inventory and quick slots 1-8
    const demoProducts = [
      {
        name: 'Alfajor Triple Dulce de Leche',
        normalizedName: 'alfajor triple dulce de leche',
        category: 'GOLOSINAS',
        barcode: '779001',
        salePriceCents: 120000,
        costPriceCents: 75000,
        shortcutNumber: 1,
      },
      {
        name: 'Gaseosa Cola 500ml',
        normalizedName: 'gaseosa cola 500ml',
        category: 'BEBIDAS',
        barcode: '779002',
        salePriceCents: 150000,
        costPriceCents: 95000,
        shortcutNumber: 2,
      },
      {
        name: 'Agua Mineral 500ml',
        normalizedName: 'agua mineral 500ml',
        category: 'BEBIDAS',
        barcode: '779003',
        salePriceCents: 100000,
        costPriceCents: 60000,
        shortcutNumber: 3,
      },
      {
        name: 'Turrón de Maní',
        normalizedName: 'turron de mani',
        category: 'GOLOSINAS',
        barcode: '779004',
        salePriceCents: 45000,
        costPriceCents: 28000,
        shortcutNumber: 4,
      },
      {
        name: 'Chicles Menta Fuerte',
        normalizedName: 'chicles menta fuerte',
        category: 'GOLOSINAS',
        barcode: '779005',
        salePriceCents: 60000,
        costPriceCents: 35000,
        shortcutNumber: 5,
      },
      {
        name: 'Caramelos Ácidos x10',
        normalizedName: 'caramelos acidos x10',
        category: 'GOLOSINAS',
        barcode: '779006',
        salePriceCents: 80000,
        costPriceCents: 50000,
        shortcutNumber: 6,
      },
      {
        name: 'Galletitas Rellenas Vainilla',
        normalizedName: 'galletitas rellenas vainilla',
        category: 'SNACKS',
        barcode: '779007',
        salePriceCents: 180000,
        costPriceCents: 110000,
        shortcutNumber: 7,
      },
      {
        name: 'Barra de Cereal Frutilla',
        normalizedName: 'barra de cereal frutilla',
        category: 'SNACKS',
        barcode: '779008',
        salePriceCents: 90000,
        costPriceCents: 55000,
        shortcutNumber: 8,
      },
    ];

    for (const p of demoProducts) {
      const categoryId = categoryMap.get(p.category) || null;
      const product = await tx.product.create({
        data: {
          tenantId: tenant.id,
          categoryId,
          name: p.name,
          normalizedName: p.normalizedName,
          barcode: p.barcode,
          sku: `SKU-${p.barcode}`,
          salePriceCents: p.salePriceCents,
          costPriceCents: p.costPriceCents,
          unit: 'UNIT',
          isActive: true,
        },
      });

      await tx.productLocation.create({
        data: {
          productId: product.id,
          locationId: location.id,
          stockQuantity: '50.0000',
          minimumStock: '10.0000',
          quickSlot: p.shortcutNumber,
          isAvailable: true,
          version: 1,
        },
      });

      await tx.inventoryMovement.create({
        data: {
          tenantId: tenant.id,
          locationId: location.id,
          productId: product.id,
          type: 'INITIAL',
          delta: '50.0000',
          previousStock: '0',
          resultingStock: '50.0000',
          reason: 'Carga de inventario inicial de demostración',
          userId: user.id,
        },
      });
    }

    return {
      skipped: false,
      user: { id: user.id, email: user.email, name: user.name },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      location: { id: location.id, name: location.name },
      membership: { id: membership.id, role: membership.role },
      productsCount: demoProducts.length,
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
