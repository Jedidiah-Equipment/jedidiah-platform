export function translationEnvelope<Value>(
  value: Value,
  sourceHash: string,
  translatedAt = '2026-07-13T10:00:00.000Z',
) {
  return { isManual: false, sourceHash, translatedAt, value };
}
