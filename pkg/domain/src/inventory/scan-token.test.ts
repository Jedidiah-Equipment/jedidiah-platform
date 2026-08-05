import { describe, expect, it } from 'vitest';

import { BADGE_SCAN_PREFIX, badgeScanToken, isStoresActorExpired, parseScanToken } from './scan-token.js';

describe('parseScanToken', () => {
  it('reads a badge card as the person it encodes', () => {
    expect(parseScanToken('badge:user-42')).toEqual({ kind: 'badge', userId: 'user-42' });
  });

  it('reads anything else as a Part code', () => {
    expect(parseScanToken('BRG-100')).toEqual({ kind: 'part-code', partCode: 'BRG-100' });
  });

  it('trims the wedge’s stray whitespace and newline off both kinds', () => {
    expect(parseScanToken('  badge:user-42\r\n')).toEqual({ kind: 'badge', userId: 'user-42' });
    expect(parseScanToken(' BRG-100 \n')).toEqual({ kind: 'part-code', partCode: 'BRG-100' });
  });

  it('reports an empty scan rather than resolving it as a Part', () => {
    expect(parseScanToken('   ')).toEqual({ kind: 'empty' });
    expect(parseScanToken('')).toEqual({ kind: 'empty' });
  });

  /** A card whose payload is only the prefix names nobody; treating it as a Part code would be worse. */
  it('reports a badge prefix with no user behind it as empty', () => {
    expect(parseScanToken('badge:')).toEqual({ kind: 'empty' });
    expect(parseScanToken('badge:   ')).toEqual({ kind: 'empty' });
  });

  it('matches the prefix case-insensitively, since label stock is printed either way', () => {
    expect(parseScanToken('BADGE:user-42')).toEqual({ kind: 'badge', userId: 'user-42' });
  });

  it('round-trips the token the badge label encodes', () => {
    expect(parseScanToken(badgeScanToken('user-42'))).toEqual({ kind: 'badge', userId: 'user-42' });
    expect(badgeScanToken('user-42').startsWith(BADGE_SCAN_PREFIX)).toBe(true);
  });
});

describe('isStoresActorExpired', () => {
  const lastInteractionAt = new Date('2026-08-05T08:00:00.000Z').getTime();

  it('keeps the actor while the tablet is being used', () => {
    expect(isStoresActorExpired({ lastInteractionAt, now: lastInteractionAt + 60_000 })).toBe(false);
  });

  it('clears the actor once the tablet has been left alone', () => {
    expect(isStoresActorExpired({ lastInteractionAt, now: lastInteractionAt + 5 * 60_000 })).toBe(true);
  });

  it('expires exactly at the timeout, so the boundary is never attributed to the last person', () => {
    expect(isStoresActorExpired({ lastInteractionAt, now: lastInteractionAt + 3 * 60_000 })).toBe(true);
    expect(isStoresActorExpired({ lastInteractionAt, now: lastInteractionAt + 3 * 60_000 - 1 })).toBe(false);
  });

  /** A clock that steps backwards must not read as "long idle" and drop the person mid-scan. */
  it('holds the actor when the clock reads earlier than the last interaction', () => {
    expect(isStoresActorExpired({ lastInteractionAt, now: lastInteractionAt - 60_000 })).toBe(false);
  });
});
