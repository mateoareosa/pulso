import { describe, expect, it, vi } from 'vitest';
import type { SessionContext } from '../src/auth/cookie.utils.js';
import type {
  ParsedProductImportFile,
  ProductImportParser,
} from '../src/catalog/product-import.parser.js';
import { ProductImportParseError } from '../src/catalog/product-import.parser.js';
import { ProductImportService } from '../src/catalog/product-import.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const session: SessionContext = {
  sessionId: 'session-a',
  userId: 'user-a',
  tenantId: 'tenant-a',
  locationId: 'location-a',
  membershipId: 'membership-a',
  role: 'OWNER',
  user: { id: 'user-a', email: 'owner@example.com', name: 'Owner' },
  tenant: { id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a' },
  location: { id: 'location-a', name: 'Location A' },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

function parsed(rows: ParsedProductImportFile['rows']): ParsedProductImportFile {
  return { format: 'csv', headers: ['name', 'salePriceCents'], rows };
}

function setup(
  parsedFile: ParsedProductImportFile,
  database: {
    categories?: Array<{ name: string; normalizedName: string }>;
    products?: Array<{ normalizedName: string; barcode: string | null; sku: string | null }>;
    slots?: Array<{ quickSlot: number | null }>;
  } = {}
) {
  const parser = { parse: vi.fn().mockResolvedValue(parsedFile) } as unknown as ProductImportParser;
  const prisma = {
    category: { findMany: vi.fn().mockResolvedValue(database.categories ?? []) },
    product: { findMany: vi.fn().mockResolvedValue(database.products ?? []) },
    productLocation: { findMany: vi.fn().mockResolvedValue(database.slots ?? []) },
    productImportAudit: { upsert: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  return { service: new ProductImportService(prisma, parser, 'test-preview-secret'), parser };
}

describe('ProductImportService', () => {
  it('audits parser-rejected previews without storing file contents', async () => {
    const parser = {
      parse: vi.fn().mockRejectedValue(new ProductImportParseError('UNSUPPORTED_FORMAT', 'Formato inválido')),
    } as unknown as ProductImportParser;
    const audit = vi.fn().mockResolvedValue({});
    const prisma = { productImportAudit: { upsert: audit } } as unknown as PrismaService;
    const service = new ProductImportService(prisma, parser, 'test-preview-secret');

    await expect(
      service.preview(session, {
        buffer: Buffer.from('name\nProducto'),
        fileName: '../secret-products.csv',
        mimeType: 'text/csv',
      })
    ).rejects.toThrow('Formato inválido');

    expect(audit).toHaveBeenCalledWith({
      where: { tenantId_previewTokenHash: expect.objectContaining({ tenantId: session.tenantId }) },
      create: expect.objectContaining({
        tenantId: session.tenantId,
        locationId: session.locationId,
        actorUserId: session.userId,
        result: 'REJECTED',
        totalRows: 0,
        errorCode: 'PREVIEW_UNSUPPORTED_FORMAT',
        fileName: 'secret-products.csv',
        inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      update: {},
    });
    expect(JSON.stringify(audit.mock.calls[0])).not.toContain('Producto');
  });

  it('normalizes valid rows, resolves new categories, and signs a session-scoped preview', async () => {
    const { service } = setup(
      parsed([
        {
          row: 2,
          values: {
            name: '  Café Molido  ',
            category: ' Almacén ',
            barcode: ' 77901 ',
            salePriceCents: '1500',
            initialStock: '2.5',
            minimumStock: '1',
            quickSlot: '2',
            isAvailable: 'sí',
          },
        },
      ])
    );

    const preview = await service.preview(session, {
      buffer: Buffer.from('irrelevant'),
      fileName: 'products.csv',
      mimeType: 'text/csv',
    });

    expect(preview.rows).toEqual([
      expect.objectContaining({
        row: 2,
        name: 'Café Molido',
        category: 'Almacén',
        barcode: '77901',
        salePriceCents: 1500,
        initialStock: '2.5000',
        minimumStock: '1.0000',
        quickSlot: 2,
        isAvailable: true,
      }),
    ]);
    expect(preview.summary).toEqual({ total: 1, valid: 1, invalid: 0, createdCategories: 1 });
    expect(preview.canCommit).toBe(true);
    expect(service.verifyPreviewToken(preview.previewToken, session).rows).toEqual(preview.rows);
  });

  it('returns deterministic row errors for internal and database conflicts without partial eligibility', async () => {
    const { service } = setup(
      parsed([
        {
          row: 2,
          values: {
            name: 'Alfajor',
            barcode: 'DB-1',
            sku: 'DUP',
            salePriceCents: '0',
            quickSlot: '1',
          },
        },
        {
          row: 3,
          values: {
            name: ' alfajor ',
            barcode: 'DB-1',
            sku: 'DUP',
            salePriceCents: '200',
            quickSlot: '1',
          },
        },
      ]),
      {
        products: [{ normalizedName: 'alfajor', barcode: 'DB-1', sku: null }],
        slots: [{ quickSlot: 1 }],
      }
    );

    const preview = await service.preview(session, {
      buffer: Buffer.from('same-input'),
      fileName: 'products.csv',
      mimeType: 'text/csv',
    });

    expect(preview.canCommit).toBe(false);
    expect(preview.summary).toEqual({ total: 2, valid: 0, invalid: 2, createdCategories: 0 });
    expect(preview.errors.map(({ row, field, code }) => ({ row, field, code }))).toEqual([
      { row: 2, field: 'salePriceCents', code: 'INVALID_VALUE' },
      { row: 2, field: 'name', code: 'DATABASE_DUPLICATE' },
      { row: 2, field: 'barcode', code: 'DATABASE_DUPLICATE' },
      { row: 2, field: 'quickSlot', code: 'SLOT_OCCUPIED' },
      { row: 3, field: 'name', code: 'INTERNAL_DUPLICATE' },
      { row: 3, field: 'barcode', code: 'INTERNAL_DUPLICATE' },
      { row: 3, field: 'sku', code: 'INTERNAL_DUPLICATE' },
      { row: 3, field: 'quickSlot', code: 'INTERNAL_DUPLICATE' },
      { row: 3, field: 'name', code: 'DATABASE_DUPLICATE' },
      { row: 3, field: 'barcode', code: 'DATABASE_DUPLICATE' },
      { row: 3, field: 'quickSlot', code: 'SLOT_OCCUPIED' },
    ]);
  });

  it('rejects tampered, expired, or differently scoped preview tokens', async () => {
    const { service } = setup(
      parsed([{ row: 2, values: { name: 'Yerba', salePriceCents: '1000' } }])
    );
    const preview = await service.preview(session, {
      buffer: Buffer.from('input'),
      fileName: 'products.csv',
      mimeType: 'text/csv',
    });

    expect(() => service.verifyPreviewToken(`${preview.previewToken}x`, session)).toThrow(
      'La vista previa no es válida'
    );
    expect(() =>
      service.verifyPreviewToken(preview.previewToken, { ...session, locationId: 'location-b' })
    ).toThrow('La vista previa no pertenece a la sesión activa');

    vi.useFakeTimers();
    vi.setSystemTime(new Date(preview.expiresAt).getTime() + 1);
    expect(() => service.verifyPreviewToken(preview.previewToken, session)).toThrow(
      'La vista previa expiró'
    );
    vi.useRealTimers();
  });

  it('supports a fully populated 500-row stateless preview token', async () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({
      row: index + 2,
      values: {
        name: `Producto ${index.toString().padStart(3, '0')} ${'x'.repeat(120)}`,
        barcode: `BAR-${index}`,
        sku: `SKU-${index}`,
        salePriceCents: `${index + 1}`,
      },
    }));
    const { service } = setup(parsed(rows));

    const preview = await service.preview(session, {
      buffer: Buffer.from('bounded-input'),
      fileName: 'products.csv',
      mimeType: 'text/csv',
    });

    expect(preview.rows).toHaveLength(500);
    expect(preview.summary).toEqual({ total: 500, valid: 500, invalid: 0, createdCategories: 0 });
    expect(service.verifyPreviewToken(preview.previewToken, session).rows).toHaveLength(500);
  });
});
