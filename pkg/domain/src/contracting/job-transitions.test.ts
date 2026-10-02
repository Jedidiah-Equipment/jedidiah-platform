import { describe, expect, test } from 'vitest';
import { jobTransitions } from './job-transitions.js';

describe('jobTransitions', () => {
  const at = new Date('2026-09-23T10:00:00Z');

  test('starts an Upcoming Job when its first machine arrives, and leaves an Active one alone', () => {
    expect(jobTransitions.activate({ status: 'upcoming' })).toEqual({ status: 'active' });
    expect(() => jobTransitions.activate({ status: 'completed' })).toThrow('Cannot activate a Job that is Completed.');
  });

  test('stamps each status with the columns that travel with it, and clears the ones that may not', () => {
    expect(
      jobTransitions.complete(
        { status: 'active' },
        { at, byUserId: 'jed', startDate: '2026-09-01', endDate: '2026-09-10' },
      ),
    ).toEqual({
      status: 'completed',
      completedAt: at,
      completedByUserId: 'jed',
      startDate: '2026-09-01',
      endDate: '2026-09-10',
    });
    expect(jobTransitions.price({ status: 'completed' }, { at, byUserId: 'jed', subtotal: 900, total: 1_000 })).toEqual(
      {
        status: 'priced',
        pricedAt: at,
        pricedByUserId: 'jed',
        pricedSubtotal: 900,
        pricedTotal: 1_000,
        reopenedAt: null,
        repricingNote: null,
      },
    );
    expect(jobTransitions.reopen({ status: 'priced' }, { at, note: 'Reading amended.' })).toEqual({
      status: 'completed',
      pricedAt: null,
      pricedByUserId: null,
      pricedSubtotal: null,
      pricedTotal: null,
      dieselAmount: null,
      discountAmount: null,
      reopenedAt: at,
      repricingNote: 'Reading amended.',
    });
    expect(jobTransitions.invoice({ status: 'priced' }, { at, byUserId: 'karen', invoiceNumber: 'INV-9' })).toEqual({
      status: 'invoiced',
      invoiceNumber: 'INV-9',
      invoicedAt: at,
      invoicedByUserId: 'karen',
    });
    expect(jobTransitions.cancel({ status: 'completed' }, { at, byUserId: 'jed', reason: 'Rained out' })).toEqual({
      status: 'cancelled',
      cancelledAt: at,
      cancelledByUserId: 'jed',
      cancellationReason: 'Rained out',
      completedAt: null,
      completedByUserId: null,
      reopenedAt: null,
      repricingNote: null,
    });
  });

  test('refuses a transition the lifecycle has no edge for', () => {
    expect(() => jobTransitions.cancel({ status: 'invoiced' }, { at, byUserId: 'jed', reason: 'x' })).toThrow(
      'Cannot cancel a Job that is Invoiced.',
    );
    expect(() => jobTransitions.invoice({ status: 'completed' }, { at, byUserId: 'k', invoiceNumber: 'I' })).toThrow(
      'Cannot invoice a Job that is Completed.',
    );
  });
});
