import { describe, expect, it } from 'vitest';

import { FeedbackSubmitInput } from './feedback.js';

const quoteSubject = {
  subjectType: 'quote' as const,
  quoteId: '550e8400-e29b-41d4-a716-446655440010',
};

describe('FeedbackSubmitInput', () => {
  it('accepts a general submission with non-empty text and a quote subject', () => {
    expect(
      FeedbackSubmitInput.parse({
        kind: 'general',
        subject: quoteSubject,
        text: 'The lead time on this quote looks wrong.',
      }),
    ).toEqual({
      kind: 'general',
      subject: quoteSubject,
      text: 'The lead time on this quote looks wrong.',
    });
  });

  it('accepts a general submission with a job subject', () => {
    expect(
      FeedbackSubmitInput.parse({
        kind: 'general',
        subject: {
          subjectType: 'job',
          jobId: '550e8400-e29b-41d4-a716-446655440020',
        },
        text: 'Paint bay missed the handover.',
      }).subject,
    ).toMatchObject({ subjectType: 'job' });
  });

  it('trims surrounding whitespace from the feedback text', () => {
    expect(
      FeedbackSubmitInput.parse({
        kind: 'general',
        subject: quoteSubject,
        text: '  needs a follow-up  ',
      }).text,
    ).toBe('needs a follow-up');
  });

  it('rejects empty feedback text', () => {
    expect(() =>
      FeedbackSubmitInput.parse({
        kind: 'general',
        subject: quoteSubject,
        text: '',
      }),
    ).toThrow();
  });

  it('rejects whitespace-only feedback text', () => {
    expect(() =>
      FeedbackSubmitInput.parse({
        kind: 'general',
        subject: quoteSubject,
        text: '   ',
      }),
    ).toThrow();
  });

  it('rejects a subject that sets neither a quote nor a job', () => {
    expect(() =>
      FeedbackSubmitInput.parse({
        kind: 'general',
        subject: { subjectType: 'quote' },
        text: 'Missing the subject reference.',
      }),
    ).toThrow();
  });

  it('accepts corrective-department feedback with at least one department target', () => {
    const parsed = FeedbackSubmitInput.parse({
      kind: 'corrective-feedback-department',
      subject: quoteSubject,
      text: 'Paint missed the spec.',
      departments: ['paint', 'assembly'],
    });

    expect(parsed).toMatchObject({
      kind: 'corrective-feedback-department',
      departments: ['paint', 'assembly'],
    });
  });

  it('accepts corrective-user feedback with at least one user target', () => {
    const parsed = FeedbackSubmitInput.parse({
      kind: 'corrective-feedback-user',
      subject: quoteSubject,
      text: 'Handover was skipped.',
      userIds: ['user-1', 'user-2'],
    });

    expect(parsed).toMatchObject({
      kind: 'corrective-feedback-user',
      userIds: ['user-1', 'user-2'],
    });
  });

  it('rejects corrective-department feedback with no department targets', () => {
    expect(() =>
      FeedbackSubmitInput.parse({
        kind: 'corrective-feedback-department',
        subject: quoteSubject,
        text: 'Needs a department.',
        departments: [],
      }),
    ).toThrow();
  });

  it('rejects corrective-user feedback with no user targets', () => {
    expect(() =>
      FeedbackSubmitInput.parse({
        kind: 'corrective-feedback-user',
        subject: quoteSubject,
        text: 'Needs a user.',
        userIds: [],
      }),
    ).toThrow();
  });

  it('strips target fields from a general submission', () => {
    const parsed = FeedbackSubmitInput.parse({
      kind: 'general',
      subject: quoteSubject,
      text: 'No targets here.',
      departments: ['paint'],
      userIds: ['user-1'],
    });

    expect(parsed).not.toHaveProperty('departments');
    expect(parsed).not.toHaveProperty('userIds');
  });
});
