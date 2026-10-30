import { describe, expect, test } from 'vitest';
import { breakdownPushMessage, serviceDueSoonPushMessage } from './notifications.js';

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

  test('a Breakdown changed to Code Red reads "Now Code Red" with the same body', () => {
    expect(breakdownPushMessage(breakdown, { escalated: true })).toMatchObject({
      title: 'Now Code Red · JD6140M-2',
      body: 'Hydraulic leak at Scott Farm, CJOB-00042. Reported by Sipho.',
      channelId: 'workshop',
    });
  });
});

describe('serviceDueSoonPushMessage', () => {
  test('says how far the next service is, or how far past it the Machine already is', () => {
    expect(
      serviceDueSoonPushMessage({ id: 'm1', code: 'JD6140M-2', knownHours: 1449, hoursToService: 51 }),
    ).toMatchObject({
      title: 'Service due soon · JD6140M-2',
      body: 'Known hours 1 449.0 h · 51.0 h to next service.',
      data: { kind: 'machine', path: '/contracting/machines/m1' },
    });
    expect(
      serviceDueSoonPushMessage({ id: 'm1', code: 'JD6140M-2', knownHours: 1504, hoursToService: -4 }),
    ).toMatchObject({
      title: 'Service overdue · JD6140M-2',
      body: 'Known hours 1 504.0 h · overdue by 4.0 h.',
    });
  });
});
