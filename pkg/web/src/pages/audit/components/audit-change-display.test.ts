import { describe, expect, it } from 'vitest';

import {
  formatAuditChangesJson,
  formatAuditChangeValue,
  getAuditChangeDisplays,
  getAuditFieldLabel,
} from './audit-change-display.js';

describe('audit change display helpers', () => {
  it('returns no display rows for null changes', () => {
    expect(getAuditChangeDisplays(null)).toEqual([]);
  });

  it('formats a single field change with a human label', () => {
    expect(
      getAuditChangeDisplays({
        basePrice: {
          from: 143_750,
          to: 143_937,
        },
      }),
    ).toEqual([
      {
        field: 'Base price',
        from: '143,750',
        key: 'basePrice',
        preview: 'Base price: 143,750 -> 143,937',
        to: '143,937',
      },
    ]);
  });

  it('formats multiple field changes in insertion order', () => {
    expect(
      getAuditChangeDisplays({
        lifecycleStatus: {
          from: 'active',
          to: 'paused',
        },
        quotedBasePrice: {
          from: 120_000,
          to: 125_000,
        },
      }),
    ).toEqual([
      {
        field: 'Lifecycle status',
        from: 'active',
        key: 'lifecycleStatus',
        preview: 'Lifecycle status: active -> paused',
        to: 'paused',
      },
      {
        field: 'Quoted base price',
        from: '120,000',
        key: 'quotedBasePrice',
        preview: 'Quoted base price: 120,000 -> 125,000',
        to: '125,000',
      },
    ]);
  });

  it('falls back to readable labels for unknown camel-case fields', () => {
    expect(getAuditFieldLabel('internalReferenceCode')).toBe('Internal reference code');
  });

  it('formats dates, empty values, booleans, and objects safely', () => {
    expect(formatAuditChangeValue('validUntil', '2026-05-20T08:30:00.000Z')).toContain('May');
    expect(formatAuditChangeValue('name', '')).toBe('Empty');
    expect(formatAuditChangeValue('member', true)).toBe('Yes');
    expect(formatAuditChangeValue('metadata', { source: 'seed' })).toBe('{"source":"seed"}');
  });

  it('collapses long text and object values in row previews', () => {
    expect(
      getAuditChangeDisplays({
        description: {
          from: 'Atlas wheel loader configured for regional equipment inventory.',
          to: 'Atlas wheel loader configured for regional equipment inventory. Price review captured.',
        },
        metadata: {
          from: { source: 'seed' },
          to: { source: 'manual' },
        },
      }).map((display) => display.preview),
    ).toEqual(['Description changed', 'Metadata changed']);
  });

  it('keeps pretty raw JSON available', () => {
    expect(
      formatAuditChangesJson({
        notes: {
          from: null,
          to: 'Ready',
        },
      }),
    ).toBe('{\n  "notes": {\n    "from": null,\n    "to": "Ready"\n  }\n}');
  });
});
