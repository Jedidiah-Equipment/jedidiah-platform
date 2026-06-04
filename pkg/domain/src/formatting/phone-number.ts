const ZA_E164 = /^\+27([1-9]\d)(\d{3})(\d{4})$/;

export function formatPhoneNumber(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';

  const match = ZA_E164.exec(trimmed);
  if (!match) return trimmed;

  const [, areaCode, prefix, lineNumber] = match;
  return `+27 (0) ${areaCode} ${prefix} ${lineNumber}`;
}
