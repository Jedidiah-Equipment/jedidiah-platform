import { describe, expect, it } from 'vitest';

import { findBomCycle } from './bom.js';

/** `a` is built from `b`, `b` from `c`, and so on down each chain. */
const bomOf = (entries: Record<string, string[]>) => new Map(Object.entries(entries));

describe('findBomCycle', () => {
  it('accepts a component that builds from nothing', () => {
    expect(findBomCycle({ bomByParent: bomOf({}), componentPartIds: ['b'], parentPartId: 'a' })).toBeNull();
  });

  it('rejects a Part listed as its own component', () => {
    expect(findBomCycle({ bomByParent: bomOf({}), componentPartIds: ['a'], parentPartId: 'a' })).toEqual(['a', 'a']);
  });

  it('rejects the two-step cycle a component would close', () => {
    // b already builds from a, so giving a a component of b closes the loop.
    expect(findBomCycle({ bomByParent: bomOf({ b: ['a'] }), componentPartIds: ['b'], parentPartId: 'a' })).toEqual([
      'a',
      'b',
      'a',
    ]);
  });

  it('rejects a cycle several levels down a chain', () => {
    const bomByParent = bomOf({ b: ['c'], c: ['d'], d: ['e'], e: ['a'] });

    expect(findBomCycle({ bomByParent, componentPartIds: ['b'], parentPartId: 'a' })).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'a',
    ]);
  });

  it('accepts a diamond, where one component is reachable by two routes but never loops back', () => {
    // a builds from b and c; both build from d. Shared descendants are not a cycle.
    const bomByParent = bomOf({ b: ['d'], c: ['d'], d: [] });

    expect(findBomCycle({ bomByParent, componentPartIds: ['b', 'c'], parentPartId: 'a' })).toBeNull();
  });

  it('terminates on a cycle that does not involve the Part being saved', () => {
    // Pre-existing bad data below the walk must not spin the search forever.
    const bomByParent = bomOf({ b: ['c'], c: ['b'] });

    expect(findBomCycle({ bomByParent, componentPartIds: ['b'], parentPartId: 'a' })).toBeNull();
  });
});
