export interface QuickProduct {
  productId: string;
  name: string;
  category: string;
  barcode: string;
  unitPriceCents: number;
  shortcutNumber: number;
}

export const QUICK_PRODUCTS: QuickProduct[] = [
  {
    productId: 'prod-01',
    name: 'Alfajor Triple Dulce de Leche',
    category: 'GOLOSINAS',
    barcode: '779001',
    unitPriceCents: 120000,
    shortcutNumber: 1,
  },
  {
    productId: 'prod-02',
    name: 'Gaseosa Cola 500ml',
    category: 'BEBIDAS',
    barcode: '779002',
    unitPriceCents: 150000,
    shortcutNumber: 2,
  },
  {
    productId: 'prod-03',
    name: 'Agua Mineral 500ml',
    category: 'BEBIDAS',
    barcode: '779003',
    unitPriceCents: 100000,
    shortcutNumber: 3,
  },
  {
    productId: 'prod-04',
    name: 'Turrón de Maní',
    category: 'GOLOSINAS',
    barcode: '779004',
    unitPriceCents: 45000,
    shortcutNumber: 4,
  },
  {
    productId: 'prod-05',
    name: 'Chicles Menta Fuerte',
    category: 'GOLOSINAS',
    barcode: '779005',
    unitPriceCents: 60000,
    shortcutNumber: 5,
  },
  {
    productId: 'prod-06',
    name: 'Caramelos Ácidos x10',
    category: 'GOLOSINAS',
    barcode: '779006',
    unitPriceCents: 80000,
    shortcutNumber: 6,
  },
  {
    productId: 'prod-07',
    name: 'Galletitas Rellenas Vainilla',
    category: 'SNACKS',
    barcode: '779007',
    unitPriceCents: 180000,
    shortcutNumber: 7,
  },
  {
    productId: 'prod-08',
    name: 'Barra de Cereal Frutilla',
    category: 'SNACKS',
    barcode: '779008',
    unitPriceCents: 90000,
    shortcutNumber: 8,
  },
];

/**
 * Normalizes text for accent-insensitive and case-insensitive comparison.
 */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Filters quick products dynamically by query (matching name or barcode).
 * Prioritizes exact barcode matches.
 * Returns all products if query is empty.
 */
export function searchProducts(products: QuickProduct[], query: string): QuickProduct[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return products;
  }

  const normalizedQuery = normalizeSearchText(trimmed);

  const exactBarcodeMatches = products.filter((p) => p.barcode === trimmed);
  const otherMatches = products.filter((p) => {
    if (p.barcode === trimmed) return false;
    const normalizedName = normalizeSearchText(p.name);
    return normalizedName.includes(normalizedQuery) || p.barcode.includes(trimmed);
  });

  return [...exactBarcodeMatches, ...otherMatches];
}
