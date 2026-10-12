import { APP_ROLES } from '@pkg/schema';
import { describe, expect, test } from 'vitest';
import { accessForRole } from '../testing/index.js';
import { breakdownPushMessage, serviceDueSoonPushMessage, shouldRegisterForPush } from './notifications.js';

describe('shouldRegisterForPush', () => {
  test('asks only the roles a workshop push can reach', () => {
    const asked = APP_ROLES.filter((role) => shouldRegisterForPush(accessForRole(role, 'u')));

    expect(asked.sort()).toEqual(['contracting-admin', 'contracting-manager', 'super-admin', 'workshop-manager']);
    expect(shouldRegisterForPush(null)).toBe(false);
  });
});

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
