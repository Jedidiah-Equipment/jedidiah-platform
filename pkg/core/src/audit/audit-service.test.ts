import { describe, expect, it } from 'vitest';

import { createAuditChanges, createAuditSummary, jobAuditDescriptor, productAuditDescriptor } from './audit-service.js';

describe('createAuditChanges', () => {
  it('returns changed audited fields only', () => {
    expect(
      createAuditChanges(
        { id: 'product-id', name: 'Wheel Loader', ignored: 'old' },
        { id: 'product-id', name: 'Wheel Loader XL', ignored: 'new' },
        productAuditDescriptor.fields,
      ),
    ).toEqual({
      name: {
        from: 'Wheel Loader',
        to: 'Wheel Loader XL',
      },
    });
  });

  it('returns null when audited values are unchanged', () => {
    expect(
      createAuditChanges(
        { id: 'product-id', name: 'Wheel Loader' },
        { id: 'product-id', name: 'Wheel Loader' },
        productAuditDescriptor.fields,
      ),
    ).toBeNull();
  });
});

describe('createAuditSummary', () => {
  it('summarizes created entities', () => {
    expect(
      createAuditSummary({
        action: 'created',
        after: { name: 'Wheel Loader' },
        before: null,
        changes: null,
        entityType: 'product',
      }),
    ).toBe('Created product "Wheel Loader"');
  });

  it('summarizes primary label updates as renames', () => {
    expect(
      createAuditSummary({
        action: 'updated',
        after: { name: 'Wheel Loader XL' },
        before: { name: 'Wheel Loader' },
        changes: {
          name: {
            from: 'Wheel Loader',
            to: 'Wheel Loader XL',
          },
        },
        entityType: 'product',
      }),
    ).toBe('Renamed product "Wheel Loader" to "Wheel Loader XL"');
  });

  it('summarizes non-primary updates generically', () => {
    expect(
      createAuditSummary({
        action: 'updated',
        after: { name: 'Wheel Loader', status: 'active' },
        before: { name: 'Wheel Loader', status: 'draft' },
        changes: {
          status: {
            from: 'draft',
            to: 'active',
          },
        },
        entityType: 'product',
      }),
    ).toBe('Updated product "Wheel Loader"');
  });

  it('uses the job code for job summaries', () => {
    expect(
      createAuditSummary({
        action: 'updated',
        after: { code: 'JOB-00001', status: 'paused' },
        before: { code: 'JOB-00001', status: 'active' },
        changes: {
          status: {
            from: 'active',
            to: 'paused',
          },
        },
        entityType: jobAuditDescriptor.entityType,
      }),
    ).toBe('Updated job "JOB-00001"');
  });

  it('formats job codes in summaries without requiring padded audit records', () => {
    expect(
      createAuditSummary({
        action: 'updated',
        after: { code: 1, status: 'paused' },
        before: { code: 1, status: 'active' },
        changes: {
          status: {
            from: 'active',
            to: 'paused',
          },
        },
        entityType: jobAuditDescriptor.entityType,
      }),
    ).toBe('Updated job "JOB-00001"');
  });
});
