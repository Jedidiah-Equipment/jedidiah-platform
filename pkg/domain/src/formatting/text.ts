export function toSentenceCase(value: string) {
  const lower = value.toLowerCase();

  return lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : '';
}
