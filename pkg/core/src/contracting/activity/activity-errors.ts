export type ActivityErrorCode = 'activity.forbidden';

export class ActivityError extends Error {
  constructor(
    readonly code: ActivityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ActivityError';
  }
}

export const isActivityError = (error: unknown): error is ActivityError => error instanceof ActivityError;
