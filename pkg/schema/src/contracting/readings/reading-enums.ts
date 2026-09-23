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
