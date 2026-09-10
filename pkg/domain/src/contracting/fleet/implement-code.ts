/** `Gravel trailer (6t)` → `GRAVEL-TRAILER-6T`: uppercase, one hyphen per run of anything else. */
export function implementCodePrefix(categoryName: string): string {
  const prefix = categoryName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return prefix || 'IMPLEMENT';
}
/**
 * The next `PREFIX-<n>`: one past the highest suffix already taken under that prefix, retired
 * codes included. A code is an identity, so numbers are never reissued and gaps are left alone.
 */
export function nextImplementCode(prefix: string, existingCodes: readonly string[]): string {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i');
  const highest = existingCodes.reduce((max, code) => {
    const match = pattern.exec(code.trim());
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${highest + 1}`;
}
