export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Extract the trailing numeric ID from a slug like "calamba-area-4" → 4 */
export function idFromSlug(slug: string): number {
  const last = slug.split('-').pop()
  return Number(last) || 0
}
