import type { FeedbackKind, FeedbackSubjectType } from '@pkg/schema';

/**
 * Shared submission-form copy for the Feedback visibility split (ADR 0010). Job general feedback is
 * public to job readers; quote general feedback stays private until quote-scoped read paths exist.
 */
export type FeedbackVisibilityNotice = {
  description: string;
  submitLabel: string;
  title: 'PUBLIC' | 'PRIVATE';
  visibility: 'public' | 'private';
};

const feedbackSubjectNouns = {
  job: 'Job',
  quote: 'Quote',
} as const satisfies Record<FeedbackSubjectType, string>;

export function getFeedbackVisibilityNotice(
  kind: FeedbackKind,
  subjectType: FeedbackSubjectType,
): FeedbackVisibilityNotice {
  if (kind === 'general') {
    if (subjectType === 'quote') {
      return {
        description: 'Only Super Administrators will see this feedback.',
        submitLabel: 'Submit Private Feedback',
        title: 'PRIVATE',
        visibility: 'private',
      };
    }

    return {
      description: `Everyone who can view this ${feedbackSubjectNouns[subjectType]} will see this feedback.`,
      submitLabel: 'Submit Public Feedback',
      title: 'PUBLIC',
      visibility: 'public',
    };
  }

  return {
    description: 'Only Super Administrators will see this feedback.',
    submitLabel: 'Submit Private Feedback',
    title: 'PRIVATE',
    visibility: 'private',
  };
}
