export function toSentenceCase(value: string) {
  const lower = value.toLowerCase();

  return lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : '';
}

/** The first name from a person's display name, with surrounding whitespace ignored. */
export function getFirstName(fullName: string): string {
  const trimmed = fullName.trim();

  return trimmed.split(/\s+/, 1)[0] ?? trimmed;
}

/** Joins phrases as prose: "a", "a or b", "a, b or c". */
export function joinOr(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
}
