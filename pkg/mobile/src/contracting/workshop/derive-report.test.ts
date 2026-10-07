import { describe, expect, test } from 'vitest';
import { deriveReport } from './breakdown-form';

const subject = { kind: 'machine' as const, id: '0b7a4c84-7f0b-4b8e-9d55-0d6b8a0f0c11' };

describe('deriveReport', () => {
  test('sends only with a subject, an urgency and a description', () => {
    const ready = { subject, urgency: 'code-green' as const, description: 'Brake light out', photoCount: 0 };
    expect(deriveReport(ready, { canReport: true, busy: false })).toEqual({
      canSend: true,
      photosLeft: 6,
      messages: {},
    });
    expect(
      deriveReport(
        { subject: null, urgency: null, description: '  ', photoCount: 6 },
        { canReport: true, busy: false },
      ),
    ).toEqual({
      canSend: false,
      photosLeft: 0,
      messages: {
        subject: 'Choose the Machine or Implement.',
        urgency: 'Choose Code Red or Code Green.',
        description: 'Describe the problem',
      },
    });
    expect(deriveReport(ready, { canReport: false, busy: false }).canSend).toBe(false);
    expect(deriveReport(ready, { canReport: true, busy: true }).canSend).toBe(false);
  });
});
