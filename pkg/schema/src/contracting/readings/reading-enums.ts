/** Every role a stored reading can carry; Wave 1 captures only the first and last. */
export const readingRoles = ['baseline', 'arrival', 'departure', 'spot'] as const;
export type ReadingRole = (typeof readingRoles)[number];
export const readingCaptureRoles = ['baseline', 'spot'] as const;
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
  'reading.previous_changed',
  'reading.below_latest',
  'reading.above_next',
  'reading.baseline_exists',
  'reading.invalid_amendment',
  'reading.forbidden',
  'reading.wrong_status',
  'reading.invalid_role',
  'reading.machine_on_site',
  'reading.implement_on_site',
  'reading.job_invoiced',
  'reading.future_read_at',
  'reading.outruns_clock',
] as const;
export type ReadingErrorCode = (typeof readingErrorCodes)[number];
