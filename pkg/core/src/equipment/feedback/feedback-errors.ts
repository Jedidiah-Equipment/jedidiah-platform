import type { FeedbackSubjectType } from '@pkg/schema/equipment';

export type FeedbackErrorCode = 'feedback.not_found' | 'feedback.subject_not_found';

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
export const feedbackSubjectNotFound = (subjectType: FeedbackSubjectType, id: string) =>
  new FeedbackError('feedback.subject_not_found', `Feedback subject not found: ${subjectType} ${id}`);
