import { expect, test } from 'vitest';

import { pushAudienceFor } from './push-audience';

test('a workshop manager is asked for workshop and note alerts', () => {
  expect(pushAudienceFor({ id: 'wendy', contractingRole: 'workshop-manager' })).toMatchObject({
    kinds: [
      'contracting.breakdown.code-red',
      'contracting.breakdown.code-green',
      'contracting.service-due-soon',
      'contracting.breakdown-note',
      'contracting.job-note',
    ],
    channels: [
      { id: 'workshop', name: 'Workshop', importance: 'max' },
      { id: 'notes', name: 'Notes', importance: 'default' },
    ],
    mayAsk: true,
  });
});

test('a shared device account is never reached, whatever its role', () => {
  expect(pushAudienceFor({ id: 'bay-tablet', contractingRole: 'workshop-manager', isDevice: true })).toEqual({
    userId: 'bay-tablet',
    kinds: [],
    channels: [],
    mayAsk: false,
    isDevice: true,
  });
});

test('a Foreman is now asked for permission and can mute either note kind', () => {
  expect(pushAudienceFor({ id: 'sipho', contractingRole: 'foreman' })).toMatchObject({
    kinds: ['contracting.breakdown-note', 'contracting.job-note'],
    mayAsk: true,
  });
});
