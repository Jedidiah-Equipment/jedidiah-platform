import { describe, expect, it } from 'vitest';

import { getFeedbackVisibilityNotice } from './feedback-visibility.js';

describe('getFeedbackVisibilityNotice', () => {
  it('marks job general feedback as public', () => {
    expect(getFeedbackVisibilityNotice('general', 'job')).toMatchObject({
      submitLabel: 'Submit Public Feedback',
      title: 'PUBLIC',
      visibility: 'public',
    });
  });

  it('keeps quote general feedback private until quote-scoped reads exist', () => {
    expect(getFeedbackVisibilityNotice('general', 'quote')).toMatchObject({
      submitLabel: 'Submit Private Feedback',
      title: 'PRIVATE',
      visibility: 'private',
    });
  });

  it('marks corrective feedback as private for every subject', () => {
    expect(getFeedbackVisibilityNotice('corrective-feedback-department', 'job')).toMatchObject({
      submitLabel: 'Submit Private Feedback',
      title: 'PRIVATE',
      visibility: 'private',
    });
    expect(getFeedbackVisibilityNotice('corrective-feedback-user', 'quote')).toMatchObject({
      submitLabel: 'Submit Private Feedback',
      title: 'PRIVATE',
      visibility: 'private',
    });
  });
});
