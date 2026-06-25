import type { FeedbackSubjectType } from '@pkg/schema';

export class FeedbackSubjectNotFoundError extends Error {
  readonly code = 'feedback.subject_not_found';
  readonly metadata: { id: string; subjectType: FeedbackSubjectType };

  constructor(subjectType: FeedbackSubjectType, id: string) {
    super(`Feedback subject not found: ${subjectType} ${id}`);
    this.name = 'FeedbackSubjectNotFoundError';
    this.metadata = { id, subjectType };
  }
}

export type FeedbackCoreError = FeedbackSubjectNotFoundError;

export function isFeedbackCoreError(error: unknown): error is FeedbackCoreError {
  return error instanceof FeedbackSubjectNotFoundError;
}
