import { Decimal } from '@prisma/client/runtime/library';

/**
 * Normalizes text for accent-insensitive and case-insensitive matching and storage.
 * e.g. "Golosinas & Caramelos Ácidos" -> "golosinas & caramelos acidos"
 */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Converts a string, number, or Decimal to a Decimal instance with fixed 4 decimal places.
 */
export function toDecimal(val: string | number | Decimal): Decimal {
  if (val instanceof Decimal) {
    return val;
  }
  const str = typeof val === 'number' ? val.toFixed(4) : val;
  return new Decimal(str);
}

/**
 * Serializes a Prisma Decimal to a clean string format.
 */
export function formatDecimal(decimal: Decimal | null | undefined): string {
  if (!decimal) return '0.0000';
  return decimal.toFixed(4);
}
