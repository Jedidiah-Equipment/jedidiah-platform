import type { FeedbackSubjectType } from '@pkg/schema/equipment';

export type FeedbackErrorCode = 'feedback.invalid_target' | 'feedback.not_found' | 'feedback.subject_not_found';

export class FeedbackError extends Error {
  constructor(
    readonly code: FeedbackErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FeedbackError';
  }
}

export const isFeedbackError = (error: unknown): error is FeedbackError => error instanceof FeedbackError;
export const feedbackNotFound = (id: string) => new FeedbackError('feedback.not_found', `Feedback not found: ${id}`);
export const feedbackTargetInvalid = () =>
  new FeedbackError('feedback.invalid_target', 'Corrective Feedback names a person without an Equipment role.');
export const feedbackSubjectNotFound = (subjectType: FeedbackSubjectType, id: string) =>
  new FeedbackError('feedback.subject_not_found', `Feedback subject not found: ${subjectType} ${id}`);
