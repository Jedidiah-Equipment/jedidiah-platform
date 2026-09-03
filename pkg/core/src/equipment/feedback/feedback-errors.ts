import type { FeedbackSubjectType } from '@pkg/schema';

export class FeedbackNotFoundError extends Error {
  readonly code = 'feedback.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Feedback not found: ${id}`);
    this.name = 'FeedbackNotFoundError';
    this.metadata = { id };
  }
}

export class FeedbackSubjectNotFoundError extends Error {
  readonly code = 'feedback.subject_not_found';
  readonly metadata: { id: string; subjectType: FeedbackSubjectType };

  constructor(subjectType: FeedbackSubjectType, id: string) {
    super(`Feedback subject not found: ${subjectType} ${id}`);
    this.name = 'FeedbackSubjectNotFoundError';
    this.metadata = { id, subjectType };
  }
}

export type FeedbackCoreError = FeedbackNotFoundError | FeedbackSubjectNotFoundError;

export function isFeedbackCoreError(error: unknown): error is FeedbackCoreError {
  return error instanceof FeedbackNotFoundError || error instanceof FeedbackSubjectNotFoundError;
}
