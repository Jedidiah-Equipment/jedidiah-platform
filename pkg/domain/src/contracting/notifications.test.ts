import { describe, expect, test } from 'vitest';
import { breakdownPushMessage, notePushMessage, serviceDueSoonPushMessage } from './notifications.js';

describe('breakdownPushMessage', () => {
  const breakdown = {
    id: 'b1',
    urgency: 'code-red' as const,
    subjectCode: 'JD6140M-2',
    firstLine: 'Hydraulic leak',
    farmName: 'Scott Farm',
    jobNumber: 'CJOB-00042',
    reporterName: 'Sipho',
  };

  test('names the urgency, subject, place and reporter, and opens the Breakdown', () => {
    expect(breakdownPushMessage(breakdown)).toMatchObject({
      title: 'Code Red · JD6140M-2',
      body: 'Hydraulic leak at Scott Farm, CJOB-00042. Reported by Sipho.',
      data: { business: 'contracting', kind: 'breakdown', id: 'b1', path: '/contracting/workshop/b1' },
      channelId: 'workshop',
    });
  });

  test('reads cleanly for a Breakdown reported without a Job', () => {
    const message = breakdownPushMessage({ ...breakdown, firstLine: 'Flat tyre.', farmName: null, jobNumber: null });

    expect(message.body).toBe('Flat tyre. Reported by Sipho.');
  });
});

describe('serviceDueSoonPushMessage', () => {
  test('says how far the next service is, or how far past it the Machine already is', () => {
    expect(serviceDueSoonPushMessage({ id: 'm1', code: 'JD6140M-2', hoursToService: 51 })).toMatchObject({
      title: 'Service due soon · JD6140M-2',
      body: '51.0 h to next service.',
      data: { kind: 'machine', path: '/contracting/machines/m1' },
    });
    expect(serviceDueSoonPushMessage({ id: 'm1', code: 'JD6140M-2', hoursToService: -4 })).toMatchObject({
      title: 'Service overdue · JD6140M-2',
      body: 'Overdue by 4.0 h.',
    });
  });
});

test.each(['job', 'breakdown'] as const)(
  'a long %s note uses a bounded preview without splitting Unicode characters',
  (kind) => {
    const message = notePushMessage({
      kind,
      id: '00000000-0000-4000-8000-000000000001',
      code: 'CJOB-00037',
      authorName: 'Sipho',
      text: '🌾'.repeat(2000),
    });
    expect(message.body).toBe(`Sipho: ${'🌾'.repeat(240)}…`);
  },
);
