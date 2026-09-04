export function translationEnvelopeFixture<Value>(value: Value) {
  return {
    isManual: false,
    sourceHash: 'abc123',
    translatedAt: '2026-07-13T10:00:00.000Z',
    value,
  };
}
