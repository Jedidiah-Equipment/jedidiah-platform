import { describe, expect, it } from 'vitest';

import { FeedbackFormValues, type FeedbackFormValues as FeedbackFormValuesType, toSubmitInput } from './types';

const JOB_ID = '11111111-1111-4111-8111-111111111111';

function values(overrides: Partial<FeedbackFormValuesType> = {}): FeedbackFormValuesType {
  return { kind: 'general', text: 'It works', departments: [], userIds: [], ...overrides };
}

describe('toSubmitInput', () => {
  it('maps general feedback to a job subject without targets', () => {
    expect(toSubmitInput(values(), JOB_ID)).toEqual({
      kind: 'general',
      subject: { subjectType: 'job', jobId: JOB_ID },
      text: 'It works',
    });
  });

  it('carries departments for corrective-department feedback only', () => {
    const input = toSubmitInput(
      values({ kind: 'corrective-feedback-department', departments: ['paint'], userIds: ['ignored'] }),
      JOB_ID,
    );

    expect(input).toEqual({
      kind: 'corrective-feedback-department',
      subject: { subjectType: 'job', jobId: JOB_ID },
      text: 'It works',
      departments: ['paint'],
    });
    expect(input).not.toHaveProperty('userIds');
  });

  it('carries userIds for corrective-user feedback only', () => {
    const input = toSubmitInput(
      values({ kind: 'corrective-feedback-user', userIds: ['user-1'], departments: ['paint'] }),
      JOB_ID,
    );

    expect(input).toEqual({
      kind: 'corrective-feedback-user',
      subject: { subjectType: 'job', jobId: JOB_ID },
      text: 'It works',
      userIds: ['user-1'],
    });
    expect(input).not.toHaveProperty('departments');
  });
});

describe('FeedbackFormValues target cardinality', () => {
  it('accepts general feedback with empty targets', () => {
    expect(FeedbackFormValues.safeParse(values()).success).toBe(true);
  });

  it('requires at least one department for corrective-department', () => {
    const result = FeedbackFormValues.safeParse(values({ kind: 'corrective-feedback-department' }));

    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((candidate) => candidate.path[0] === 'departments');
    expect(issue?.message).toBe('Select at least one department');
  });

  it('requires at least one user for corrective-user', () => {
    const result = FeedbackFormValues.safeParse(values({ kind: 'corrective-feedback-user' }));

    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((candidate) => candidate.path[0] === 'userIds');
    expect(issue?.message).toBe('Select at least one user');
  });

  it('accepts corrective feedback once a matching target is present', () => {
    expect(
      FeedbackFormValues.safeParse(values({ kind: 'corrective-feedback-department', departments: ['assembly'] }))
        .success,
    ).toBe(true);
  });
});
