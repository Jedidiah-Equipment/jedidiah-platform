import { describe, expect, test } from 'vitest';

import { toDisplayBuildState } from './product-unit-build-state.js';

const owner = { id: '00000000-0000-4000-8000-0000000000c1' };

describe('toDisplayBuildState', () => {
  test('reads a built machine a Customer owns as Complete', () => {
    expect(toDisplayBuildState('on-hand', owner)).toBe('complete');
  });

  test('reads a built machine we still hold as On Hand', () => {
    expect(toDisplayBuildState('on-hand', null)).toBe('on-hand');
  });

  test('keeps a machine still being built In Build whoever owns it', () => {
    // Ownership moves at the sale, so a build-to-order machine is owned while it is still in a Bay.
    expect(toDisplayBuildState('in-build', owner)).toBe('in-build');
    expect(toDisplayBuildState('in-build', null)).toBe('in-build');
  });
});
