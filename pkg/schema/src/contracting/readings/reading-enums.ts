/** Every role a stored reading can carry; Wave 1 captures only the first and last. */
export const readingRoles = ['baseline', 'arrival', 'departure', 'spot'] as const;
export type ReadingRole = (typeof readingRoles)[number];
export const readingCaptureRoles = ['baseline', 'spot'] as const;
export const readingMethods = ['photo', 'manual'] as const;
export const readingVerifications = ['pending', 'agrees', 'disagrees', 'low-confidence', 'not-applicable'] as const;
export type ReadingVerification = (typeof readingVerifications)[number];
