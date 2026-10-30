export const readingMethods = ['manual', 'telematics'] as const;
export type ReadingMethod = (typeof readingMethods)[number];
/** Who a Telematics Reading's hours came from. */
export const telematicsProviders = ['john-deere'] as const;
export type TelematicsProvider = (typeof telematicsProviders)[number];

/** Every refusal a reading write can carry, as the server sends it. */
export const readingErrorCodes = [
  'reading.not_found',
  'reading.retired_machine',
  'reading.capture_id_conflict',
  'reading.below_latest',
  'reading.above_next',
  'reading.invalid_amendment',
  'reading.forbidden',
  'reading.future_read_at',
  'reading.outruns_clock',
] as const;
export type ReadingErrorCode = (typeof readingErrorCodes)[number];
