import { expect, test, vi } from 'vitest';

const observability = vi.hoisted(() => ({ addBreadcrumb: vi.fn(), captureEvent: vi.fn() }));

vi.mock('@/lib/observability', () => observability);

import { recordReadingCaptured } from './observability';

test('reports a capture’s answer as role, photo presence and refusal code only', () => {
  recordReadingCaptured({ role: 'spot', hasPhoto: true, refused: 'reading.below_latest' });

  expect(observability.captureEvent).toHaveBeenCalledWith('reading captured', {
    role: 'spot',
    hasPhoto: true,
    refused: 'reading.below_latest',
  });
  expect(observability.addBreadcrumb).toHaveBeenCalledWith('contracting', 'reading captured', {
    role: 'spot',
    hasPhoto: true,
    refused: 'reading.below_latest',
  });
});
