export const breakdownUrgencies = ['code-red', 'code-green'] as const;
export type BreakdownUrgency = (typeof breakdownUrgencies)[number];
export const breakdownStatuses = ['open', 'in-progress', 'solved'] as const;
export type BreakdownStatus = (typeof breakdownStatuses)[number];
export const unsolvedBreakdownStatuses = ['open', 'in-progress'] as const satisfies readonly BreakdownStatus[];
export const breakdownSubjectKinds = ['machine', 'implement'] as const;
export type BreakdownSubjectKind = (typeof breakdownSubjectKinds)[number];

/** Every refusal a Breakdown write can carry, as the server sends it. */
export const breakdownErrorCodes = [
  'breakdown.not_found',
  'breakdown.forbidden',
  'breakdown.wrong_status',
  'breakdown.solved',
  // A retired subject, an unknown id, or both/neither given.
  'breakdown.invalid_subject',
  // The Job is not open, or the subject is not on it.
  'breakdown.invalid_job',
  // The user is not a non-device Mechanic.
  'breakdown.invalid_mechanic',
  'breakdown.invalid_upload',
  'breakdown.too_many_photos',
  'breakdown.report_id_conflict',
] as const;
export type BreakdownErrorCode = (typeof breakdownErrorCodes)[number];
export const BREAKDOWN_MAX_PHOTOS = 6;
