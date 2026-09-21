import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  productImportPreviewResponseSchema,
  productImportResultSchema,
  productImportRowSchema,
  type ProductImportColumn,
  type ProductImportPreviewResponse,
  type ProductImportResult,
  type ProductImportRow,
  type ProductImportRowError,
} from '@pulso/contracts';
import { Prisma } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import { z } from 'zod';
import type { SessionContext } from '../auth/cookie.utils.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeSearchText, toDecimal } from './catalog.utils.js';
import {
  ProductImportParseError,
  ProductImportParser,
  type ParsedProductImportRow,
  type ProductImportFile,
} from './product-import.parser.js';

const PREVIEW_TTL_MS = 15 * 60 * 1000;
const TOKEN_VERSION = 1;
const TOKEN_IV_BYTES = 12;
const TOKEN_TAG_BYTES = 16;
export const PRODUCT_IMPORT_PREVIEW_SECRET = Symbol('PRODUCT_IMPORT_PREVIEW_SECRET');

const previewTokenPayloadSchema = z.object({
  version: z.literal(TOKEN_VERSION),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  sessionId: z.string().min(1),
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
  fileName: z.string().min(1).max(255),
  rows: z.array(productImportRowSchema).max(500),
  canCommit: z.boolean(),
});

export type ProductImportPreviewTokenPayload = z.infer<typeof previewTokenPayloadSchema>;

class ProductImportCommitConflict extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function nullableText(value: string | undefined): string | null {
  return value?.trim() || null;
}

function decimal(value: string | undefined): string | null {
  const text = value?.trim() || '0';
  if (!/^\d+(?:\.\d{1,4})?$/.test(text)) return null;
  const [whole = '0', fraction = ''] = text.split('.');
  if (whole.length > 8) return null;
  return `${whole}.${fraction.padEnd(4, '0')}`;
}

function integer(value: string | undefined): number | null {
  const text = value?.trim();
  if (!text || !/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function booleanValue(value: string | undefined): boolean | null {
  if (value === undefined || value.trim() === '') return true;
  const normalized = normalizeSearchText(value);
  if (['true', '1', 'yes', 'si'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return null;
}

function error(
  row: number,
  field: ProductImportColumn,
  code: string,
  message: string
): ProductImportRowError {
  return { row, field, code, message };
}

function normalizeRow(source: ParsedProductImportRow): {
  row: ProductImportRow;
  errors: ProductImportRowError[];
} {
  const errors: ProductImportRowError[] = [];
  const rawName = source.values.name?.trim() ?? '';
  if (!rawName || rawName.length > 200) {
    errors.push(
      error(source.row, 'name', 'INVALID_VALUE', 'El nombre debe tener entre 1 y 200 caracteres')
    );
  }

  const rawCategory = nullableText(source.values.category);
  if (rawCategory && rawCategory.length > 100) {
    errors.push(
      error(source.row, 'category', 'INVALID_VALUE', 'La categoría admite hasta 100 caracteres')
    );
  }
  const rawBarcode = nullableText(source.values.barcode);
  if (rawBarcode && rawBarcode.length > 64) {
    errors.push(
      error(
        source.row,
        'barcode',
        'INVALID_VALUE',
        'El código de barras admite hasta 64 caracteres'
      )
    );
  }
  const rawSku = nullableText(source.values.sku);
  if (rawSku && rawSku.length > 64) {
    errors.push(error(source.row, 'sku', 'INVALID_VALUE', 'El SKU admite hasta 64 caracteres'));
  }

  const salePriceCents = integer(source.values.salePriceCents);
  if (salePriceCents === null || salePriceCents <= 0) {
    errors.push(
      error(
        source.row,
        'salePriceCents',
        'INVALID_VALUE',
        'El precio de venta debe ser un entero positivo'
      )
    );
  }
  const costText = nullableText(source.values.costPriceCents);
  const costPriceCents = costText === null ? null : integer(costText);
  if (costText !== null && costPriceCents === null) {
    errors.push(
      error(
        source.row,
        'costPriceCents',
        'INVALID_VALUE',
        'El costo debe ser un entero no negativo'
      )
    );
  }

  const rawUnit = source.values.unit?.trim() || 'UNIT';
  if (rawUnit.length > 20) {
    errors.push(error(source.row, 'unit', 'INVALID_VALUE', 'La unidad admite hasta 20 caracteres'));
  }
  const initialStock = decimal(source.values.initialStock);
  if (initialStock === null) {
    errors.push(
      error(
        source.row,
        'initialStock',
        'INVALID_VALUE',
        'El stock inicial debe ser un decimal no negativo'
      )
    );
  }
  const minimumStock = decimal(source.values.minimumStock);
  if (minimumStock === null) {
    errors.push(
      error(
        source.row,
        'minimumStock',
        'INVALID_VALUE',
        'El stock mínimo debe ser un decimal no negativo'
      )
    );
  }

  const slotText = nullableText(source.values.quickSlot);
  const quickSlot = slotText === null ? null : integer(slotText);
  if (slotText !== null && (quickSlot === null || quickSlot < 1 || quickSlot > 8)) {
    errors.push(
      error(source.row, 'quickSlot', 'INVALID_VALUE', 'El slot rápido debe estar entre 1 y 8')
    );
  }
  const isAvailable = booleanValue(source.values.isAvailable);
  if (isAvailable === null) {
    errors.push(
      error(
        source.row,
        'isAvailable',
        'INVALID_VALUE',
        'Disponibilidad debe ser sí/no o true/false'
      )
    );
  }

  const row = productImportRowSchema.parse({
    row: source.row,
    name: rawName.slice(0, 200) || `[Fila ${source.row} inválida]`,
    category: rawCategory?.slice(0, 100) ?? null,
    barcode: rawBarcode?.slice(0, 64) ?? null,
    sku: rawSku?.slice(0, 64) ?? null,
    salePriceCents: salePriceCents && salePriceCents > 0 ? salePriceCents : 1,
    costPriceCents: costPriceCents ?? null,
    unit: rawUnit.slice(0, 20) || 'UNIT',
    initialStock: initialStock ?? '0.0000',
    minimumStock: minimumStock ?? '0.0000',
    quickSlot: quickSlot && quickSlot >= 1 && quickSlot <= 8 ? quickSlot : null,
    isAvailable: isAvailable ?? true,
  });
  return { row, errors };
}

function duplicateKey(value: string | null | undefined, normalize = false): string | null {
  if (!value) return null;
  return normalize ? normalizeSearchText(value) : value.trim().toLowerCase();
}

@Injectable()
export class ProductImportService {
  private readonly tokenKey: Buffer;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProductImportParser) private readonly parser: ProductImportParser,
    @Inject(PRODUCT_IMPORT_PREVIEW_SECRET) secret: string
  ) {
    this.tokenKey = createHash('sha256').update(secret, 'utf8').digest();
  }

  async preview(
    session: SessionContext,
    file: ProductImportFile
  ): Promise<ProductImportPreviewResponse> {
    let parsed;
    try {
      parsed = await this.parser.parse(file);
    } catch (caught) {
      if (caught instanceof ProductImportParseError) {
        await this.recordPreviewRejectedAudit(session, file, caught.code);
        throw new BadRequestException({ message: caught.message, code: caught.code });
      }
      throw caught;
    }

    const normalized = parsed.rows.map(normalizeRow);
    const rows = normalized.map((entry) => entry.row);
    const errors = normalized.flatMap((entry) => entry.errors);
    this.addInternalDuplicateErrors(rows, errors);
    await this.addDatabaseErrors(session, rows, errors);
    errors.sort((left, right) => left.row - right.row);

    const invalidRows = new Set(errors.map((entry) => entry.row));
    const existingCategories = await this.prisma.category.findMany({
      where: { tenantId: session.tenantId },
      select: { name: true, normalizedName: true },
    });
    const existingCategoryNames = new Set(
      existingCategories.map((category) => category.normalizedName)
    );
    const createdCategoryNames = new Set(
      rows
        .map((row) => duplicateKey(row.category, true))
        .filter((name): name is string => name !== null && !existingCategoryNames.has(name))
    );
    const canCommit = errors.length === 0;
    const expiresAt = Date.now() + PREVIEW_TTL_MS;
    const response = {
      previewToken: this.signPreviewToken({
        version: TOKEN_VERSION,
        inputHash: createHash('sha256').update(file.buffer).digest('hex'),
        sessionId: session.sessionId,
        userId: session.userId,
        tenantId: session.tenantId,
        locationId: session.locationId,
        issuedAt: Date.now(),
        expiresAt,
        fileName: basename(file.fileName).slice(0, 255) || 'import',
        rows,
        canCommit,
      }),
      expiresAt: new Date(expiresAt).toISOString(),
      rows,
      errors,
      summary: {
        total: rows.length,
        valid: rows.length - invalidRows.size,
        invalid: invalidRows.size,
        createdCategories: createdCategoryNames.size,
      },
      canCommit,
    };
    return productImportPreviewResponseSchema.parse(response);
  }

  private async recordPreviewRejectedAudit(
    session: SessionContext,
    file: ProductImportFile,
    errorCode: string
  ): Promise<void> {
    const inputHash = createHash('sha256').update(file.buffer).digest('hex');
    const previewTokenHash = createHash('sha256')
      .update(`${session.sessionId}:${inputHash}:${file.fileName}`, 'utf8')
      .digest('hex');
    await this.prisma.productImportAudit.upsert({
      where: { tenantId_previewTokenHash: { tenantId: session.tenantId, previewTokenHash } },
      create: {
        tenantId: session.tenantId,
        locationId: session.locationId,
        actorUserId: session.userId,
        previewTokenHash,
        inputHash,
        fileName: basename(file.fileName).slice(0, 255) || 'import',
        result: 'REJECTED',
        totalRows: 0,
        errorCode: `PREVIEW_${errorCode}`,
      },
      update: {},
    });
  }

  verifyPreviewToken(token: string, session: SessionContext): ProductImportPreviewTokenPayload {
    let payload: ProductImportPreviewTokenPayload;
    try {
      const bytes = Buffer.from(token, 'base64url');
      if (bytes.toString('base64url') !== token) throw new Error('non-canonical token');
      if (bytes.length <= TOKEN_IV_BYTES + TOKEN_TAG_BYTES) throw new Error('short token');
      const iv = bytes.subarray(0, TOKEN_IV_BYTES);
      const tag = bytes.subarray(TOKEN_IV_BYTES, TOKEN_IV_BYTES + TOKEN_TAG_BYTES);
      const ciphertext = bytes.subarray(TOKEN_IV_BYTES + TOKEN_TAG_BYTES);
      const decipher = createDecipheriv('aes-256-gcm', this.tokenKey, iv);
      decipher.setAuthTag(tag);
      const cleartext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
        'utf8'
      );
      payload = previewTokenPayloadSchema.parse(JSON.parse(cleartext));
    } catch {
      throw new BadRequestException('La vista previa no es válida');
    }
    if (payload.expiresAt < Date.now()) throw new BadRequestException('La vista previa expiró');
    if (
      payload.sessionId !== session.sessionId ||
      payload.userId !== session.userId ||
      payload.tenantId !== session.tenantId ||
      payload.locationId !== session.locationId
    ) {
      throw new BadRequestException('La vista previa no pertenece a la sesión activa');
    }
    return payload;
  }

  async commit(session: SessionContext, previewToken: string): Promise<ProductImportResult> {
    const payload = this.verifyPreviewToken(previewToken, session);
    const previewTokenHash = createHash('sha256').update(previewToken, 'utf8').digest('hex');
    const existing = await this.prisma.productImportAudit.findUnique({
      where: { tenantId_previewTokenHash: { tenantId: session.tenantId, previewTokenHash } },
    });
    if (existing?.result === 'SUCCESS') return this.auditResult(existing);
    if (existing?.result === 'REJECTED') {
      throw new ConflictException('La importación ya fue rechazada');
    }
    if (!payload.canCommit) {
      await this.recordRejectedAudit(session, payload, previewTokenHash, 'PREVIEW_BLOCKED');
      throw new BadRequestException('La vista previa contiene errores y no puede confirmarse');
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${previewTokenHash}))`;
          const lockedExisting = await tx.productImportAudit.findUnique({
            where: {
              tenantId_previewTokenHash: { tenantId: session.tenantId, previewTokenHash },
            },
          });
          if (lockedExisting?.result === 'SUCCESS') return this.auditResult(lockedExisting);
          if (lockedExisting?.result === 'REJECTED') {
            throw new ProductImportCommitConflict('ALREADY_REJECTED');
          }

          const conflicts: ProductImportRowError[] = [];
          await this.addDatabaseErrors(session, payload.rows, conflicts, tx);
          if (conflicts.length > 0) throw new ProductImportCommitConflict('CONCURRENT_CONFLICT');

          const categories = await tx.category.findMany({
            where: { tenantId: session.tenantId },
            select: { id: true, normalizedName: true },
          });
          const categoryIds = new Map(
            categories.map((category) => [category.normalizedName, category.id])
          );
          let categoryCount = 0;
          for (const row of payload.rows) {
            const normalizedCategory = duplicateKey(row.category, true);
            if (normalizedCategory && !categoryIds.has(normalizedCategory)) {
              const category = await tx.category.create({
                data: {
                  tenantId: session.tenantId,
                  name: row.category!,
                  normalizedName: normalizedCategory,
                },
              });
              categoryIds.set(normalizedCategory, category.id);
              categoryCount += 1;
            }
          }

          for (const row of payload.rows) {
            const categoryId = duplicateKey(row.category, true);
            const product = await tx.product.create({
              data: {
                tenantId: session.tenantId,
                categoryId: categoryId ? categoryIds.get(categoryId) : null,
                name: row.name,
                normalizedName: normalizeSearchText(row.name),
                barcode: row.barcode ?? null,
                sku: row.sku ?? null,
                salePriceCents: row.salePriceCents,
                costPriceCents: row.costPriceCents ?? null,
                unit: row.unit,
                isActive: true,
              },
            });
            const initialStock = toDecimal(row.initialStock);
            await tx.productLocation.create({
              data: {
                productId: product.id,
                locationId: session.locationId,
                stockQuantity: initialStock,
                minimumStock: toDecimal(row.minimumStock),
                quickSlot: row.quickSlot ?? null,
                isAvailable: row.isAvailable,
                lastCostCents: row.costPriceCents ?? null,
              },
            });
            if (!initialStock.isZero()) {
              await tx.inventoryMovement.create({
                data: {
                  tenantId: session.tenantId,
                  locationId: session.locationId,
                  productId: product.id,
                  type: 'INITIAL',
                  delta: initialStock,
                  previousStock: new Prisma.Decimal(0),
                  resultingStock: initialStock,
                  reason: 'Stock inicial de importación masiva',
                  userId: session.userId,
                },
              });
            }
          }

          const audit = await tx.productImportAudit.create({
            data: {
              tenantId: session.tenantId,
              locationId: session.locationId,
              actorUserId: session.userId,
              previewTokenHash,
              inputHash: payload.inputHash,
              fileName: payload.fileName,
              result: 'SUCCESS',
              totalRows: payload.rows.length,
              importedCount: payload.rows.length,
              categoryCount,
            },
          });
          return this.auditResult(audit);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (caught) {
      const successfulReplay = await this.prisma.productImportAudit.findUnique({
        where: { tenantId_previewTokenHash: { tenantId: session.tenantId, previewTokenHash } },
      });
      if (successfulReplay?.result === 'SUCCESS') return this.auditResult(successfulReplay);

      const errorCode =
        caught instanceof ProductImportCommitConflict
          ? caught.code
          : caught instanceof Prisma.PrismaClientKnownRequestError
            ? caught.code
            : 'PERSISTENCE_ERROR';
      await this.recordRejectedAudit(session, payload, previewTokenHash, errorCode);
      throw new ConflictException(
        errorCode === 'CONCURRENT_CONFLICT'
          ? 'La importación tiene conflictos con cambios recientes'
          : 'No se pudo aplicar la importación; no se realizó ningún cambio'
      );
    }
  }

  private auditResult(audit: {
    id: string;
    importedCount: number;
    categoryCount: number;
  }): ProductImportResult {
    return productImportResultSchema.parse({
      importedCount: audit.importedCount,
      categoryCount: audit.categoryCount,
      auditId: audit.id,
    });
  }

  private async recordRejectedAudit(
    session: SessionContext,
    payload: ProductImportPreviewTokenPayload,
    previewTokenHash: string,
    errorCode: string
  ): Promise<void> {
    await this.prisma.productImportAudit.upsert({
      where: { tenantId_previewTokenHash: { tenantId: session.tenantId, previewTokenHash } },
      create: {
        tenantId: session.tenantId,
        locationId: session.locationId,
        actorUserId: session.userId,
        previewTokenHash,
        inputHash: payload.inputHash,
        fileName: payload.fileName,
        result: 'REJECTED',
        totalRows: payload.rows.length,
        errorCode,
      },
      update: {},
    });
  }

  private signPreviewToken(payload: ProductImportPreviewTokenPayload): string {
    const iv = randomBytes(TOKEN_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.tokenKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(previewTokenPayloadSchema.parse(payload)), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  }

  private addInternalDuplicateErrors(
    rows: ProductImportRow[],
    errors: ProductImportRowError[]
  ): void {
    const seen = new Map<ProductImportColumn, Set<string>>([
      ['name', new Set()],
      ['barcode', new Set()],
      ['sku', new Set()],
      ['quickSlot', new Set()],
    ]);
    for (const row of rows) {
      const values: Array<[ProductImportColumn, string | null]> = [
        ['name', duplicateKey(row.name, true)],
        ['barcode', duplicateKey(row.barcode)],
        ['sku', duplicateKey(row.sku)],
        ['quickSlot', row.quickSlot?.toString() ?? null],
      ];
      for (const [field, value] of values) {
        if (!value) continue;
        const valuesSeen = seen.get(field);
        if (valuesSeen?.has(value)) {
          errors.push(
            error(
              row.row,
              field,
              'INTERNAL_DUPLICATE',
              `El valor de ${field} está repetido en el archivo`
            )
          );
        } else {
          valuesSeen?.add(value);
        }
      }
    }
  }

  private async addDatabaseErrors(
    session: SessionContext,
    rows: ProductImportRow[],
    errors: ProductImportRowError[],
    database: Pick<Prisma.TransactionClient, 'product' | 'productLocation'> = this.prisma
  ): Promise<void> {
    const [products, slots] = await Promise.all([
      database.product.findMany({
        where: { tenantId: session.tenantId },
        select: { normalizedName: true, barcode: true, sku: true },
      }),
      database.productLocation.findMany({
        where: {
          locationId: session.locationId,
          quickSlot: { not: null },
          product: { tenantId: session.tenantId },
        },
        select: { quickSlot: true },
      }),
    ]);
    const names = new Set(products.map((product) => product.normalizedName));
    const barcodes = new Set(
      products.map((product) => duplicateKey(product.barcode)).filter(Boolean)
    );
    const skus = new Set(products.map((product) => duplicateKey(product.sku)).filter(Boolean));
    const occupiedSlots = new Set(
      slots.map((slot) => slot.quickSlot).filter((slot): slot is number => slot !== null)
    );

    for (const row of rows) {
      if (names.has(normalizeSearchText(row.name))) {
        errors.push(
          error(row.row, 'name', 'DATABASE_DUPLICATE', 'Ya existe un producto con ese nombre')
        );
      }
      if (row.barcode && barcodes.has(duplicateKey(row.barcode))) {
        errors.push(
          error(row.row, 'barcode', 'DATABASE_DUPLICATE', 'El código de barras ya existe')
        );
      }
      if (row.sku && skus.has(duplicateKey(row.sku))) {
        errors.push(error(row.row, 'sku', 'DATABASE_DUPLICATE', 'El SKU ya existe'));
      }
      if (
        row.quickSlot !== null &&
        row.quickSlot !== undefined &&
        occupiedSlots.has(row.quickSlot)
      ) {
        errors.push(error(row.row, 'quickSlot', 'SLOT_OCCUPIED', 'El slot rápido ya está ocupado'));
      }
    }
  }
}
