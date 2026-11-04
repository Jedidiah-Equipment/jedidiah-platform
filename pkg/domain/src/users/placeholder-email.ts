/**
 * The address a person who never signs in (Driver, Mechanic, Bay Operator) carries: unique and
 * obviously fake. The fleet import omits the suffix, since reruns find people by the bare address;
 * the Users form adds one so two people sharing a name stay apart.
 */
export function placeholderEmail(name: string, suffix?: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const local = [slug || 'person', suffix].filter(Boolean).join('-');

  return `${local}@fleet.jedidiah.invalid`;
}
