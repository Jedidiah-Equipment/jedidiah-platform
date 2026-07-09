import type { DatabaseTransaction } from '@pkg/db';
import type { AuditChanges } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  type AuditDescriptor,
  buildAuditSummary,
  defineAuditDescriptor,
  diffAuditRecords,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditDelete,
} from './audit-service.js';

type Widget = { id: string; name: string; price: number };

const widgetDescriptor: AuditDescriptor<Widget> = defineAuditDescriptor({
  entityType: 'product',
  noun: 'widget',
  primaryLabelField: 'name',
  entityId: (widget) => widget.id,
  toRecord: (widget) => ({ name: widget.name, price: widget.price }),
});

type Gear = { id: string; label: string; teeth: number };
type GearedWidget = Widget & { gears: Gear[] };

const gearedDescriptor: AuditDescriptor<GearedWidget> = defineAuditDescriptor({
  entityType: 'product',
  noun: 'widget',
  primaryLabelField: 'name',
  entityId: (widget) => widget.id,
  toRecord: (widget) => ({ name: widget.name, price: widget.price }),
  toCollections: (widget) => ({
    gear: widget.gears.map((gear) => ({ key: gear.id, label: gear.label, value: gear })),
  }),
});

const widget: GearedWidget = { id: 'w1', name: 'Wheel Loader', price: 10, gears: [] };
const gear = (id: string, label: string, teeth: number): Gear => ({ id, label, teeth });

describe('diffAuditRecords', () => {
  it('returns changed fields only, keyed by the after record', () => {
    expect(diffAuditRecords({ name: 'Wheel Loader', price: 10 }, { name: 'Wheel Loader XL', price: 10 })).toEqual({
      name: { from: 'Wheel Loader', to: 'Wheel Loader XL' },
    });
  });

  it('returns null when nothing audited changed', () => {
    expect(diffAuditRecords({ name: 'Wheel Loader' }, { name: 'Wheel Loader' })).toBeNull();
  });

  it('normalizes undefined to null so absent values do not register as changes', () => {
    expect(diffAuditRecords({ name: 'Wheel Loader' }, { name: 'Wheel Loader', price: undefined })).toBeNull();
  });
});

describe('diffAuditUpdate', () => {
  it('diffs the projected records of two inputs', () => {
    expect(
      diffAuditUpdate(
        widgetDescriptor,
        { id: 'w1', name: 'Wheel Loader', price: 10 },
        { id: 'w1', name: 'Wheel Loader', price: 12 },
      ),
    ).toEqual({ price: { from: 10, to: 12 } });
  });

  it('ignores fields the projection drops (the audited field set is the record keys)', () => {
    const labelled = defineAuditDescriptor<Widget>({
      ...widgetDescriptor,
      toRecord: (widget) => ({ price: widget.price }),
    });

    expect(
      diffAuditUpdate(labelled, { id: 'w1', name: 'A', price: 10 }, { id: 'w1', name: 'B', price: 10 }),
    ).toBeNull();
  });
});

describe('diffAuditUpdate collections', () => {
  it('records only the changed element, keyed by prefix and label', () => {
    expect(
      diffAuditUpdate(
        gearedDescriptor,
        { ...widget, gears: [gear('g1', 'Drive gear', 12), gear('g2', 'Idler gear', 20)] },
        { ...widget, gears: [gear('g1', 'Drive gear', 14), gear('g2', 'Idler gear', 20)] },
      ),
    ).toEqual({
      'gear:Drive gear': { from: gear('g1', 'Drive gear', 12), to: gear('g1', 'Drive gear', 14) },
    });
  });

  it('records added elements with a null from and removed elements with a null to', () => {
    expect(
      diffAuditUpdate(
        gearedDescriptor,
        { ...widget, gears: [gear('g1', 'Drive gear', 12)] },
        { ...widget, gears: [gear('g2', 'Idler gear', 20)] },
      ),
    ).toEqual({
      'gear:Idler gear': { from: null, to: gear('g2', 'Idler gear', 20) },
      'gear:Drive gear': { from: gear('g1', 'Drive gear', 12), to: null },
    });
  });

  it('matches renamed elements by key and labels them with the after-side label', () => {
    expect(
      diffAuditUpdate(
        gearedDescriptor,
        { ...widget, gears: [gear('g1', 'Drive gear', 12)] },
        { ...widget, gears: [gear('g1', 'Main drive gear', 12)] },
      ),
    ).toEqual({
      'gear:Main drive gear': { from: gear('g1', 'Drive gear', 12), to: gear('g1', 'Main drive gear', 12) },
    });
  });

  it('suffixes colliding labels (remove one element and add another with the same name)', () => {
    expect(
      diffAuditUpdate(
        gearedDescriptor,
        { ...widget, gears: [gear('g1', 'Drive gear', 12)] },
        { ...widget, gears: [gear('g2', 'Drive gear', 20)] },
      ),
    ).toEqual({
      'gear:Drive gear': { from: null, to: gear('g2', 'Drive gear', 20) },
      'gear:Drive gear (2)': { from: gear('g1', 'Drive gear', 12), to: null },
    });
  });

  it('pairs elements sharing a key in array order', () => {
    expect(
      diffAuditUpdate(
        gearedDescriptor,
        { ...widget, gears: [gear('dup', 'Gear A', 10), gear('dup', 'Gear B', 20)] },
        { ...widget, gears: [gear('dup', 'Gear A', 10), gear('dup', 'Gear B', 24)] },
      ),
    ).toEqual({
      'gear:Gear B': { from: gear('dup', 'Gear B', 20), to: gear('dup', 'Gear B', 24) },
    });
  });

  it('merges scalar and collection changes and skips unchanged collections', () => {
    expect(
      diffAuditUpdate(
        gearedDescriptor,
        { ...widget, price: 10, gears: [gear('g1', 'Drive gear', 12)] },
        { ...widget, price: 12, gears: [gear('g1', 'Drive gear', 12)] },
      ),
    ).toEqual({ price: { from: 10, to: 12 } });
  });

  it('falls back to the counterpart label, then the key, when an element has no label', () => {
    const unlabelled = defineAuditDescriptor<GearedWidget>({
      ...gearedDescriptor,
      toCollections: (input) => ({
        gear: input.gears.map((item) => ({
          key: item.id,
          label: item.label === '' ? undefined : item.label,
          value: item.teeth,
        })),
      }),
    });

    expect(
      diffAuditUpdate(
        unlabelled,
        { ...widget, gears: [gear('g1', 'Drive gear', 12)] },
        { ...widget, gears: [gear('g1', '', 14), gear('g2', '', 20)] },
      ),
    ).toEqual({
      'gear:Drive gear': { from: 12, to: 14 },
      'gear:g2': { from: null, to: 20 },
    });
  });

  it('returns null when neither scalars nor collections changed', () => {
    const gears = [gear('g1', 'Drive gear', 12)];

    expect(diffAuditUpdate(gearedDescriptor, { ...widget, gears }, { ...widget, gears: [...gears] })).toBeNull();
  });
});

describe('audit collection snapshots', () => {
  const captureInsert = () => {
    const inserted: { changes: AuditChanges }[] = [];
    const db = {
      insert: () => ({
        values: (row: { changes: AuditChanges }) => {
          inserted.push(row);
          return Promise.resolve();
        },
      }),
    } as unknown as DatabaseTransaction;

    return { db, inserted };
  };

  it('snapshots each collection element on create with a null from', async () => {
    const { db, inserted } = captureInsert();

    await recordAuditCreate({
      db,
      descriptor: gearedDescriptor,
      actorUserId: null,
      input: { ...widget, gears: [gear('g1', 'Drive gear', 12)] },
    });

    expect(inserted[0]?.changes['gear:Drive gear']).toEqual({ from: null, to: gear('g1', 'Drive gear', 12) });
  });

  it('snapshots each collection element on delete with a null to', async () => {
    const { db, inserted } = captureInsert();

    await recordAuditDelete({
      db,
      descriptor: gearedDescriptor,
      actorUserId: null,
      input: { ...widget, gears: [gear('g1', 'Drive gear', 12)] },
    });

    expect(inserted[0]?.changes['gear:Drive gear']).toEqual({ from: gear('g1', 'Drive gear', 12), to: null });
  });
});

describe('buildAuditSummary', () => {
  it('summarizes created entities from the label', () => {
    expect(buildAuditSummary(widgetDescriptor, 'created', null, 'Wheel Loader')).toBe('Created widget "Wheel Loader"');
  });

  it('summarizes deletions from the label', () => {
    expect(buildAuditSummary(widgetDescriptor, 'deleted', null, 'Wheel Loader')).toBe('Deleted widget "Wheel Loader"');
  });

  it('summarizes primary-label changes as renames', () => {
    expect(
      buildAuditSummary(
        widgetDescriptor,
        'updated',
        { name: { from: 'Wheel Loader', to: 'Wheel Loader XL' } },
        'Wheel Loader XL',
      ),
    ).toBe('Renamed widget "Wheel Loader" to "Wheel Loader XL"');
  });

  it('summarizes non-primary updates generically', () => {
    expect(buildAuditSummary(widgetDescriptor, 'updated', { price: { from: 10, to: 12 } }, 'Wheel Loader')).toBe(
      'Updated widget "Wheel Loader"',
    );
  });

  it('applies the primary label formatter (e.g. job codes) and tolerates a non-record label', () => {
    const jobDescriptor: AuditDescriptor<{ id: string; code: number }> = defineAuditDescriptor({
      entityType: 'job',
      noun: 'job',
      primaryLabelField: 'code',
      primaryLabelFormatter: (value) =>
        typeof value === 'number' ? `JOB-${String(value).padStart(5, '0')}` : String(value),
      entityId: (job) => job.id,
      label: (job) => job.code,
      toRecord: (job) => ({ code: job.code }),
    });

    expect(buildAuditSummary(jobDescriptor, 'created', null, 1)).toBe('Created job "JOB-00001"');
  });

  it('falls back to "Unknown" when the label is nullish', () => {
    expect(buildAuditSummary(widgetDescriptor, 'created', null, undefined)).toBe('Created widget "Unknown"');
  });
});
