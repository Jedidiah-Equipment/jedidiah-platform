import { describe, expect, it } from 'vitest';

import {
  type AuditDescriptor,
  buildAuditSummary,
  defineAuditDescriptor,
  diffAuditRecords,
  diffAuditUpdate,
} from './audit-service.js';

type Widget = { id: string; name: string; price: number };

const widgetDescriptor: AuditDescriptor<Widget> = defineAuditDescriptor({
  entityType: 'product',
  noun: 'widget',
  primaryLabelField: 'name',
  entityId: (widget) => widget.id,
  toRecord: (widget) => ({ name: widget.name, price: widget.price }),
});

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
