import { formatNumber } from '@pkg/domain';
import { type BreakdownActionSubject, type BreakdownActor, judgeBreakdownAction } from '@pkg/domain/contracting';
import type { BreakdownActionBlockedReason, BreakdownActionName, BreakdownErrorCode } from '@pkg/schema/contracting';
import { BREAKDOWN_MAX_PHOTOS } from '@pkg/schema/contracting';
import { translatingConstraintViolations } from '../../errors/constraint-violations.js';

/** Which Breakdown Action a refusal refused, and why: public context a surface can branch on. */
export type RefusedBreakdownAction = { action: BreakdownActionName; reason: BreakdownActionBlockedReason };

export class BreakdownError extends Error {
  constructor(
    readonly code: BreakdownErrorCode,
    message: string,
    readonly refused?: RefusedBreakdownAction,
  ) {
    super(message);
    this.name = 'BreakdownError';
  }
}
export const isBreakdownError = (error: unknown): error is BreakdownError => error instanceof BreakdownError;
export const breakdownNotFound = () => new BreakdownError('breakdown.not_found', 'Breakdown not found.');

/** The same photo-count refusal answers both core writes and multipart stream limits. */
export const tooManyBreakdownPhotos = () =>
  new BreakdownError(
    'breakdown.too_many_photos',
    `A Breakdown keeps at most ${formatNumber(BREAKDOWN_MAX_PHOTOS)} photos.`,
  );

const refusalCodes: Record<BreakdownActionBlockedReason, BreakdownErrorCode> = {
  'no-permission': 'breakdown.forbidden',
  'not-yours': 'breakdown.forbidden',
  solved: 'breakdown.solved',
  'wrong-status': 'breakdown.wrong_status',
};

/** Refuses unless this actor may take this Breakdown Action now: every status and ownership refusal is raised here. */
export function assertBreakdownAction(
  action: BreakdownActionName,
  breakdown: BreakdownActionSubject,
  actor: BreakdownActor,
) {
  const verdict = judgeBreakdownAction(action, breakdown, actor);
  if (verdict.allowed) return;
  throw new BreakdownError(refusalCodes[verdict.reason], verdict.message, { action, reason: verdict.reason });
}

export const invalidMechanic = () =>
  new BreakdownError('breakdown.invalid_mechanic', 'Select a person with the Contracting mechanic role.');

export const withBreakdownConstraints = <T>(action: () => Promise<T>) =>
  translatingConstraintViolations(
    {
      unique: () => undefined,
      foreignKey: (constraint) => {
        if (constraint.includes('primary_mechanic')) return invalidMechanic();
        if (constraint.includes('machine_id') || constraint.includes('implement_id'))
          return new BreakdownError('breakdown.invalid_subject', 'The Machine or Implement no longer exists.');
        if (constraint.includes('job_id'))
          return new BreakdownError('breakdown.invalid_job', 'The selected Job no longer exists.');
        return undefined;
      },
    },
    action,
  );
