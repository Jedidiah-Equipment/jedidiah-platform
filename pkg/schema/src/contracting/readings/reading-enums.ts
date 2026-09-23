/** Every role a stored reading can carry; Wave 1 captures only the first and last. */
export const readingRoles = ['baseline', 'arrival', 'departure', 'spot'] as const;
export type ReadingRole = (typeof readingRoles)[number];
export const readingCaptureRoles = ['baseline', 'spot'] as const;
export const readingMethods = ['photo', 'manual'] as const;
export const readingVerifications = ['pending', 'agrees', 'disagrees', 'low-confidence', 'not-applicable'] as const;
export type ReadingVerification = (typeof readingVerifications)[number];
/** An unreviewed reading with one of these verdicts needs a look: the AI could not confirm the typed value. */
export const aiFlaggedVerifications = [
  'pending',
  'disagrees',
  'low-confidence',
] as const satisfies readonly ReadingVerification[];
export type AiFlaggedVerification = (typeof aiFlaggedVerifications)[number];
export const readingExceptionTypes = ['disputed', 'ai-flagged'] as const;
export type ReadingExceptionType = (typeof readingExceptionTypes)[number];

/** Every refusal a reading write can carry, as the server sends it and the phone reports it. */
export const readingErrorCodes = [
  'reading.not_found',
  'reading.retired_machine',
  'reading.capture_id_conflict',
  'reading.previous_changed',
  'reading.below_latest',
  'reading.baseline_exists',
  'reading.invalid_amendment',
  'reading.forbidden',
  'reading.wrong_status',
  'reading.invalid_role',
  'reading.machine_on_site',
  'reading.implement_on_site',
  'reading.no_photo',
  'reading.verification_failed',
  'reading.job_invoiced',
] as const;
export type ReadingErrorCode = (typeof readingErrorCodes)[number];
