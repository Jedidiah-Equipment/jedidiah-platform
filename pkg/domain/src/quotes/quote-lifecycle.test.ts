import { describe, expect, it } from 'vitest';

import { evaluateQuoteTransition, type QuoteTransition } from './quote-lifecycle.js';

describe('evaluateQuoteTransition', () => {
  it.each([
    ['draft', 'send'],
    ['sent', 'accept'],
    ['sent', 'reject'],
  ] as const)('allows %s -> %s', (from, transition) => {
    expect(evaluateQuoteTransition({ from, transition })).toEqual({
      allowed: true,
      reason: null,
    });
  });

  it.each([
    ['draft', 'accept'],
    ['draft', 'reject'],
    ['sent', 'send'],
    ['accepted', 'send'],
    ['accepted', 'accept'],
    ['accepted', 'reject'],
    ['rejected', 'send'],
    ['rejected', 'accept'],
    ['rejected', 'reject'],
  ] as const)('denies %s -> %s', (from, transition) => {
    const result = evaluateQuoteTransition({ from, transition });

    expect(result.allowed).toBe(false);
    expect(result.reason).toEqual(expect.any(String));
  });

  it('rejects every transition out of terminal statuses', () => {
    const transitions: QuoteTransition[] = ['send', 'accept', 'reject'];

    for (const transition of transitions) {
      expect(evaluateQuoteTransition({ from: 'accepted', transition }).allowed).toBe(false);
      expect(evaluateQuoteTransition({ from: 'rejected', transition }).allowed).toBe(false);
    }
  });
});
