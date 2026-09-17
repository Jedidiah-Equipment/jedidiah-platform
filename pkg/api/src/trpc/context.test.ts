import { describe, expect, it } from 'vitest';

import { readMobileObservabilityCorrelation } from './context.js';

describe('mobile observability correlation', () => {
  it('maps bounded PostHog tracing headers into safe capture properties', () => {
    expect(
      readMobileObservabilityCorrelation({
        'x-posthog-distinct-id': ' user_123 ',
        'x-posthog-session-id': 'session_456',
      }),
    ).toEqual({ mobileDistinctId: 'user_123', mobileSessionId: 'session_456' });
  });

  it('drops oversized tracing headers', () => {
    expect(readMobileObservabilityCorrelation({ 'x-posthog-session-id': 'x'.repeat(241) })).toEqual({});
  });
});
