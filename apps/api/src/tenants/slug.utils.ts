/**
 * Converts any business name into a URL-friendly, safe slug without accents or special characters.
 */
export function generateSlug(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || 'kiosco';
}

/**
 * Appends a numeric collision index to a base slug.
 */
export function resolveSlugCollision(baseSlug: string, attempt: number): string {
  return `${baseSlug}-${attempt}`;
}
