import { describe, it, expect } from 'vitest';
import { generateSlug, resolveSlugCollision } from '../src/tenants/slug.utils.js';

describe('Slug Utilities (RED Phase)', () => {
  it('converts names into clean url-friendly slugs without accents or special chars', () => {
    expect(generateSlug('Kiosco El Trébol')).toBe('kiosco-el-trebol');
    expect(generateSlug('Ñandú & Café 24hs!')).toBe('nandu-cafe-24hs');
    expect(generateSlug('  Espacios   Múltiples  ')).toBe('espacios-multiples');
  });

  it('provides a fallback slug for names with only symbols', () => {
    expect(generateSlug('$$$ ###')).toBe('kiosco');
    expect(generateSlug('')).toBe('kiosco');
  });

  it('generates collision-resolved candidate slugs sequentially or uniquely', () => {
    const candidate1 = resolveSlugCollision('kiosco-el-trebol', 1);
    const candidate2 = resolveSlugCollision('kiosco-el-trebol', 2);

    expect(candidate1).toBe('kiosco-el-trebol-1');
    expect(candidate2).toBe('kiosco-el-trebol-2');
  });
});
