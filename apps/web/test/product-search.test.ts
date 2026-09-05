import { describe, it, expect } from 'vitest';
import { searchProducts, QuickProduct } from '../src/features/sales/services/product-search';

const SAMPLE_PRODUCTS: QuickProduct[] = [
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

describe('searchProducts Unit Tests', () => {
  it('returns all products when query is empty or whitespace', () => {
    expect(searchProducts(SAMPLE_PRODUCTS, '')).toEqual(SAMPLE_PRODUCTS);
    expect(searchProducts(SAMPLE_PRODUCTS, '   ')).toEqual(SAMPLE_PRODUCTS);
  });

  it('matches products partially by name', () => {
    const results = searchProducts(SAMPLE_PRODUCTS, 'agua');
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Agua Mineral 500ml');
  });

  it('is case-insensitive', () => {
    expect(searchProducts(SAMPLE_PRODUCTS, 'AGUA')).toHaveLength(1);
    expect(searchProducts(SAMPLE_PRODUCTS, 'AgUa')).toHaveLength(1);
    expect(searchProducts(SAMPLE_PRODUCTS, 'gaseosa')).toHaveLength(1);
  });

  it('ignores tildes and diacritics', () => {
    // Search without tilde should match "Turrón de Maní"
    const resultsMani = searchProducts(SAMPLE_PRODUCTS, 'mani');
    expect(resultsMani).toHaveLength(1);
    expect(resultsMani[0]?.productId).toBe('prod-04');

    const resultsTurron = searchProducts(SAMPLE_PRODUCTS, 'turron');
    expect(resultsTurron).toHaveLength(1);
    expect(resultsTurron[0]?.productId).toBe('prod-04');

    // Search without tilde should match "Caramelos Ácidos x10"
    const resultsAcidos = searchProducts(SAMPLE_PRODUCTS, 'acidos');
    expect(resultsAcidos).toHaveLength(1);
    expect(resultsAcidos[0]?.productId).toBe('prod-06');
  });

  it('matches products by barcode', () => {
    const results = searchProducts(SAMPLE_PRODUCTS, '779005');
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Chicles Menta Fuerte');
  });

  it('prioritizes exact barcode matches over partial matches', () => {
    // Imagine a product whose name has 779002 and another whose barcode is exact 779002
    const results = searchProducts(SAMPLE_PRODUCTS, '779002');
    expect(results[0]?.barcode).toBe('779002');
  });

  it('handles multiple matches correctly', () => {
    const results = searchProducts(SAMPLE_PRODUCTS, '500ml');
    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name);
    expect(names).toContain('Gaseosa Cola 500ml');
    expect(names).toContain('Agua Mineral 500ml');
  });

  it('returns an empty array when no products match', () => {
    const results = searchProducts(SAMPLE_PRODUCTS, 'Inexistente999');
    expect(results).toEqual([]);
  });
});
