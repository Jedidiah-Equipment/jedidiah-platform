import { DateIso } from '@pkg/schema';
import { expect, test } from 'vitest';
import {
  capturedAtFor,
  isBackdated,
  READ_AT_NOW,
  readAtAfterRefusal,
  readAtAfterValueEdit,
  readAtEarlier,
  readAtFromInput,
  readAtFromPicker,
  readAtInputValue,
  readAtOf,
  readAtPending,
  readAtPicked,
  readAtPickedFromPicker,
  readAtProposal,
} from './read-at.js';

const now = new Date(2026, 9, 1, 12, 0, 0);

test('the request carries Read At when set, else the attempt’s own moment', () => {
  const attemptedAt = new Date('2026-10-01T10:00:00Z');
  const readAt = new Date('2026-10-01T05:30:00Z');
  expect(capturedAtFor(readAt, attemptedAt)).toBe('2026-10-01T05:30:00.000Z');
  expect(capturedAtFor(null, attemptedAt)).toBe('2026-10-01T10:00:00.000Z');
});

test('detects a backdated Read At', () => {
  expect(isBackdated(null, now)).toBe(false);
  expect(isBackdated(new Date(now.getTime() - 5 * 60_000), now)).toBe(false);
  expect(isBackdated(new Date(now.getTime() - 5 * 60_000 - 1), now)).toBe(true);
});

test('Earlier… waits on a time, and a picked one posts', () => {
  const picked = new Date(2026, 9, 1, 6);
  expect(readAtEarlier(READ_AT_NOW)).toEqual({ kind: 'earlier', at: null });
  expect(readAtPending(readAtEarlier(READ_AT_NOW))).toBe(true);
  expect(readAtOf(readAtEarlier(READ_AT_NOW))).toBeNull();
  const chosen = readAtPicked(readAtEarlier(READ_AT_NOW), picked);
  expect(chosen).toEqual({ kind: 'earlier', at: picked, by: 'hand' });
  expect(readAtEarlier(chosen)).toBe(chosen);
  expect(readAtPicked(chosen, null)).toEqual({ kind: 'earlier', at: null });
  expect(readAtPending(READ_AT_NOW)).toBe(false);
  expect(readAtOf(READ_AT_NOW)).toBeNull();
});

test('a refusal’s proposal flips to Earlier… with it, and a new value keeps its time as the person’s', () => {
  const proposal = {
    readAt: DateIso.parse(new Date(2026, 9, 1, 9, 30, 27).toISOString()),
    floor: {
      value: 125,
      capturedAt: DateIso.parse(new Date(2026, 9, 1, 9).toISOString()),
      telematicsProvider: 'john-deere' as const,
    },
    ceiling: null,
  };
  const proposed = readAtAfterRefusal(READ_AT_NOW, proposal);
  expect(proposed).toEqual({ kind: 'earlier', at: new Date(proposal.readAt), by: 'proposal', proposal });
  expect(readAtAfterRefusal(READ_AT_NOW, undefined)).toBe(READ_AT_NOW);
  // The picker shows minutes: re-picking the instant it holds keeps the proposal.
  expect(
    readAtPicked(proposed, readAtFromPicker(readAtInputValue(new Date(proposal.readAt)), readAtOf(proposed))),
  ).toBe(proposed);
  expect(readAtAfterValueEdit(proposed)).toEqual({ kind: 'earlier', at: new Date(proposal.readAt), by: 'hand' });
  expect(readAtAfterValueEdit(READ_AT_NOW)).toBe(READ_AT_NOW);
});

test('a proposal stays beside a re-picked time, and picking its minute again posts it to the second', () => {
  const proposal = {
    readAt: DateIso.parse(new Date(2026, 9, 1, 9, 30, 27).toISOString()),
    floor: {
      value: 125,
      capturedAt: DateIso.parse(new Date(2026, 9, 1, 9).toISOString()),
      telematicsProvider: 'john-deere' as const,
    },
    ceiling: null,
  };
  const moved = readAtPickedFromPicker(readAtAfterRefusal(READ_AT_NOW, proposal), '2026-10-01T09:45');
  expect(moved).toEqual({ kind: 'earlier', at: new Date(2026, 9, 1, 9, 45), by: 'hand', proposal });
  expect(readAtProposal(moved)).toBe(proposal);
  expect(readAtPickedFromPicker(moved, '2026-10-01T09:30')).toEqual({
    kind: 'earlier',
    at: new Date(proposal.readAt),
    by: 'proposal',
    proposal,
  });
  expect(readAtProposal(readAtAfterValueEdit(moved))).toBeNull();
});

test('a minute picker names its held instant while it shows that minute, else the picked minute', () => {
  const held = new Date(2026, 9, 1, 9, 30, 27);
  expect(readAtFromPicker('2026-10-01T09:30', held)).toBe(held);
  expect(readAtFromPicker('2026-10-01T09:31', held)).toEqual(new Date(2026, 9, 1, 9, 31));
  expect(readAtFromPicker('2026-10-01T09:30', null)).toEqual(new Date(2026, 9, 1, 9, 30));
  expect(readAtFromPicker('', held)).toBeNull();
});

test('round-trips a local date and time through the datetime-local value', () => {
  const readAt = new Date(2026, 9, 3, 7, 5);
  expect(readAtInputValue(readAt)).toBe('2026-10-03T07:05');
  expect(readAtFromInput('2026-10-03T07:05')).toEqual(readAt);
});

test('reads a blank or unreadable datetime-local value as no Read At', () => {
  expect(readAtFromInput('')).toBeNull();
  expect(readAtFromInput('not a time')).toBeNull();
});
