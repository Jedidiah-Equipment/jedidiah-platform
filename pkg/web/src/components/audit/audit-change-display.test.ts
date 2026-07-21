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
        from: '143 750.00',
        key: 'basePrice',
        preview: 'Base price: 143 750.00 -> 143 937.00',
        to: '143 937.00',
      },
    ]);
  });

  it('formats multiple field changes in insertion order', () => {
    expect(
      getAuditChangeDisplays({
        status: {
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
        field: 'Status',
        from: 'active',
        key: 'status',
        preview: 'Status: active -> paused',
        to: 'paused',
      },
      {
        field: 'Quoted base price',
        from: '120 000.00',
        key: 'quotedBasePrice',
        preview: 'Quoted base price: 120 000.00 -> 125 000.00',
        to: '125 000.00',
      },
    ]);
  });

  it('falls back to readable labels for unknown camel-case fields', () => {
    expect(getAuditFieldLabel('internalReferenceCode')).toBe('Internal reference code');
  });

  it('formats create and delete snapshot values with document labels', () => {
    expect(
      getAuditChangeDisplays({
        filename: {
          from: null,
          to: 'Part Book.pdf',
        },
        storageKey: {
          from: 'documents/product/product-id/part-book.pdf',
          to: null,
        },
        byteSize: {
          from: null,
          to: 2048,
        },
      }),
    ).toEqual([
      {
        field: 'Filename',
        from: 'None',
        key: 'filename',
        preview: 'Filename: None -> Part Book.pdf',
        to: 'Part Book.pdf',
      },
      {
        field: 'Storage key',
        from: 'documents/product/product-id/part-book.pdf',
        key: 'storageKey',
        preview: 'Storage key changed',
        to: 'None',
      },
      {
        field: 'Byte size',
        from: 'None',
        key: 'byteSize',
        preview: 'Byte size: None -> 2048',
        to: '2048',
      },
    ]);
  });

  it('formats dates, empty values, booleans, and objects safely', () => {
    expect(formatAuditChangeValue('validUntil', '2026-05-20T08:30:00.000Z')).toContain('May');
    expect(formatAuditChangeValue('name', '')).toBe('Empty');
    expect(formatAuditChangeValue('member', true)).toBe('Yes');
    expect(formatAuditChangeValue('metadata', { source: 'seed' })).toBe('{\n  "source": "seed"\n}');
  });

  it('labels collection element keys as "Prefix: element"', () => {
    expect(getAuditFieldLabel('assembly:Bugle eye hitch')).toBe('Assembly: Bugle eye hitch');
    expect(getAuditFieldLabel('selectedAssembly:Air brakes')).toBe('Selected assembly: Air brakes');
  });

  it('renders structured collection changes as pretty JSON with collapsed previews', () => {
    const assembly = { id: 'a1', kind: 'optional', name: 'Air brakes', parts: [], price: 6000 };

    expect(
      getAuditChangeDisplays({
        'assembly:Air brakes': {
          from: null,
          to: assembly,
        },
      }),
    ).toEqual([
      {
        field: 'Assembly: Air brakes',
        from: 'None',
        key: 'assembly:Air brakes',
        preview: 'Assembly: Air brakes changed',
        to: JSON.stringify(assembly, null, 2),
      },
    ]);
  });

  it('still renders legacy whole-collection string values verbatim', () => {
    const legacy = JSON.stringify([{ id: 'a1', kind: 'standard', name: 'Frame', parts: [] }]);

    expect(
      getAuditChangeDisplays({
        assemblies: { from: legacy, to: legacy },
      }),
    ).toEqual([
      {
        field: 'Assemblies',
        from: legacy,
        key: 'assemblies',
        preview: 'Assemblies changed',
        to: legacy,
      },
    ]);
  });

  it('formats deposit percent as a percentage', () => {
    expect(
      getAuditChangeDisplays({
        depositPercent: {
          from: 0,
          to: 30,
        },
      }),
    ).toEqual([
      {
        field: 'Deposit percent',
        from: '0%',
        key: 'depositPercent',
        preview: 'Deposit percent: 0% -> 30%',
        to: '30%',
      },
    ]);
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
