export function toSentenceCase(value: string) {
  const lower = value.toLowerCase();

  return lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : '';
}

/** The first name from a person's display name, with surrounding whitespace ignored. */
export function getFirstName(fullName: string): string {
  const trimmed = fullName.trim();

  return trimmed.split(/\s+/, 1)[0] ?? trimmed;
}
