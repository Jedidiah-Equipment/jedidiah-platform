import { expect, test } from 'vitest';

import { pushAudienceFor } from './push-audience';

test('a workshop manager is asked, on the workshop channel, for every workshop kind', () => {
  expect(pushAudienceFor({ id: 'wendy', contractingRole: 'workshop-manager' })).toMatchObject({
    kinds: ['contracting.breakdown.code-red', 'contracting.breakdown.code-green', 'contracting.service-due-soon'],
    channels: [{ id: 'workshop', name: 'Workshop' }],
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
