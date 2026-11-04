/**
 * The address of a person who never signs in: unique and obviously fake. The optional suffix keeps
 * two people sharing a name apart.
 */
export function placeholderEmail(name: string, suffix?: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const local = [slug || 'person', suffix].filter(Boolean).join('-');

  return `${local}@fleet.jedidiah.invalid`;
}
