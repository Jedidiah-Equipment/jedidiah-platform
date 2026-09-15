/** How import rows find their existing counterparts on a rerun: by natural key, case-insensitively. */
export const naturalKey = (value: string) => value.trim().toLowerCase();

/** Category names are unique per kind, case-insensitively, so both take part in the lookup key. */
export const categoryKey = (kind: string, name: string) => `${kind}:${naturalKey(name)}`;

/** Drivers and mechanics never sign in, so the address only has to be unique and obviously fake. */
export function placeholderEmail(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'person'}@fleet.jedidiah.invalid`;
}
