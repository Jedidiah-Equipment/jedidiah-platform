import { describe, expect, it } from 'vitest';

import { cascadeDown, cascadeUp, resolveSticky } from './dates.js';

describe('resolveSticky', () => {
  it.each([
    ['manual value', { value: date('2026-05-21'), setManually: true }, true],
    ['auto value', { value: date('2026-05-21'), setManually: false }, false],
    ['cleared manual value', { value: null, setManually: true }, false],
  ] as const)('resolves %s', (_caseName, input, expected) => {
    expect(resolveSticky(input)).toBe(expected);
  });
});

describe('cascadeDown', () => {
  it('shifts auto due dates by the parent date delta while sticky fields stay pinned', () => {
    const result = cascadeDown({
      anchor: {
        kind: 'start',
        previousValue: date('2026-05-01'),
        value: date('2026-05-03'),
      },
      currentLevels: [
        {
          key: 'procurement',
          dueEnd: date('2026-05-03'),
          dueStart: date('2026-05-01'),
        },
        {
          key: 'supply',
          dueEnd: date('2026-05-05'),
          dueStart: date('2026-05-03'),
        },
      ],
      durations: [
        { key: 'procurement', durationDays: 2 },
        { key: 'supply', durationDays: 2 },
      ],
      stickyMarkers: [
        { key: 'procurement', dueEndSetManually: true },
        { key: 'supply', dueStartSetManually: true },
      ],
    });

    expect(toIso(result)).toEqual([
      {
        key: 'procurement',
        dueEnd: '2026-05-03',
        dueStart: '2026-05-03',
      },
      {
        key: 'supply',
        dueEnd: '2026-05-07',
        dueStart: '2026-05-03',
      },
    ]);
  });

  it('shifts auto due dates by whole UTC days', () => {
    const result = cascadeDown({
      anchor: {
        kind: 'start',
        previousValue: dateTime('2026-03-07T05:00:00.000Z'),
        value: dateTime('2026-03-09T04:00:00.000Z'),
      },
      currentLevels: [
        {
          key: 'procurement',
          dueEnd: dateTime('2026-03-08T05:00:00.000Z'),
          dueStart: dateTime('2026-03-07T05:00:00.000Z'),
        },
      ],
      durations: [{ key: 'procurement', durationDays: 1 }],
    });

    expect(toDateTimeIso(result[0]?.dueStart ?? null)).toBe('2026-03-09T05:00:00.000Z');
    expect(toDateTimeIso(result[0]?.dueEnd ?? null)).toBe('2026-03-10T05:00:00.000Z');
  });

  it('creates a fresh forward schedule from a start anchor', () => {
    const result = cascadeDown({
      anchor: {
        kind: 'start',
        value: date('2026-05-01'),
      },
      currentLevels: [],
      durations: [
        { key: 'procurement', durationDays: 2 },
        { key: 'supply', durationDays: 3 },
        { key: 'fabrication', durationDays: 0 },
      ],
      mode: 'create',
    });

    expect(toIso(result)).toEqual([
      {
        key: 'procurement',
        dueEnd: '2026-05-03',
        dueStart: '2026-05-01',
      },
      {
        key: 'supply',
        dueEnd: '2026-05-06',
        dueStart: '2026-05-03',
      },
      {
        key: 'fabrication',
        dueEnd: '2026-05-06',
        dueStart: '2026-05-06',
      },
    ]);
  });

  it('creates a fresh backward schedule from an end anchor', () => {
    const result = cascadeDown({
      anchor: {
        kind: 'end',
        value: date('2026-05-10'),
      },
      currentLevels: [],
      durations: [
        { key: 'procurement', durationDays: 2 },
        { key: 'supply', durationDays: 3 },
      ],
      mode: 'create',
    });

    expect(toIso(result)).toEqual([
      {
        key: 'procurement',
        dueEnd: '2026-05-07',
        dueStart: '2026-05-05',
      },
      {
        key: 'supply',
        dueEnd: '2026-05-10',
        dueStart: '2026-05-07',
      },
    ]);
  });

  it('re-derives a cleared sticky field during create cascades', () => {
    const result = cascadeDown({
      anchor: {
        kind: 'start',
        value: date('2026-05-01'),
      },
      currentLevels: [
        {
          key: 'procurement',
          dueEnd: date('2026-06-01'),
          dueStart: null,
        },
      ],
      durations: [{ key: 'procurement', durationDays: 2 }],
      mode: 'create',
      stickyMarkers: [{ key: 'procurement', dueEndSetManually: true, dueStartSetManually: true }],
    });

    expect(toIso(result)).toEqual([
      {
        key: 'procurement',
        dueEnd: '2026-06-01',
        dueStart: '2026-05-01',
      },
    ]);
  });
});

describe('cascadeUp', () => {
  it('derives parent actual dates from child min start and max end while ignoring nulls', () => {
    const result = cascadeUp({
      children: [
        { actualEnd: null, actualStart: null },
        { actualEnd: dateTime('2026-05-21T12:00:00.000Z'), actualStart: dateTime('2026-05-21T08:00:00.000Z') },
        { actualEnd: dateTime('2026-05-22T13:00:00.000Z'), actualStart: dateTime('2026-05-20T09:00:00.000Z') },
      ],
      currentParent: {
        actualEnd: null,
        actualStart: null,
      },
    });

    expect(toDateTimeIso(result.actualStart)).toBe('2026-05-20T09:00:00.000Z');
    expect(toDateTimeIso(result.actualEnd)).toBe('2026-05-22T13:00:00.000Z');
  });

  it('keeps sticky parent actual dates pinned', () => {
    const result = cascadeUp({
      children: [
        { actualEnd: dateTime('2026-05-21T12:00:00.000Z'), actualStart: dateTime('2026-05-21T08:00:00.000Z') },
      ],
      currentParent: {
        actualEnd: dateTime('2026-05-25T17:00:00.000Z'),
        actualStart: dateTime('2026-05-25T09:00:00.000Z'),
      },
      stickyMarker: {
        actualEndSetManually: true,
        actualStartSetManually: true,
      },
    });

    expect(toDateTimeIso(result.actualStart)).toBe('2026-05-25T09:00:00.000Z');
    expect(toDateTimeIso(result.actualEnd)).toBe('2026-05-25T17:00:00.000Z');
  });

  it('re-derives cleared sticky parent actual dates', () => {
    const result = cascadeUp({
      children: [
        { actualEnd: dateTime('2026-05-21T12:00:00.000Z'), actualStart: dateTime('2026-05-21T08:00:00.000Z') },
      ],
      currentParent: {
        actualEnd: null,
        actualStart: null,
      },
      stickyMarker: {
        actualEndSetManually: true,
        actualStartSetManually: true,
      },
    });

    expect(toDateTimeIso(result.actualStart)).toBe('2026-05-21T08:00:00.000Z');
    expect(toDateTimeIso(result.actualEnd)).toBe('2026-05-21T12:00:00.000Z');
  });
});

function date(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateTime(value: string): Date {
  return new Date(value);
}

function toIso<Key extends string>(levels: { dueEnd: Date | null; dueStart: Date | null; key: Key }[]) {
  return levels.map((level) => ({
    key: level.key,
    dueEnd: toDateIso(level.dueEnd),
    dueStart: toDateIso(level.dueStart),
  }));
}

function toDateIso(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toDateTimeIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
