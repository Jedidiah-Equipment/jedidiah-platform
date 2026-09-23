import { DateOnlyIso } from '@pkg/schema';
import type { JobDetail } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { complementGap, jobCapabilities, queueTabLabel, toCompleteInput, toJobCreateInput } from './types.js';

describe('Job sign-off helpers', () => {
  it('complements a rounded Hour Gap without exceeding it', () => {
    expect(complementGap(9.5, 2.46)).toEqual({ travelHours: 2.5, unaccountedHours: 7 });
    expect(complementGap(9.5, 12)).toEqual({ travelHours: 9.5, unaccountedHours: 0 });
  });

  it('maps browser values to create and completion inputs', () => {
    const id = '5f1c2d3e-0001-4a00-8000-000000000001';
    expect(
      toJobCreateInput({ customerId: id, farmId: id, workTypeId: id, description: '  Dam  ', foremanUserId: '' }),
    ).toEqual({
      customerId: id,
      farmId: id,
      workTypeId: id,
      description: 'Dam',
      foremanUserId: null,
    });
    expect(
      toCompleteInput(
        id,
        {
          startDate: DateOnlyIso.parse('2026-09-01'),
          endDate: DateOnlyIso.parse('2026-09-03'),
          dieselLitres: 12.5,
          notes: '  done  ',
        },
        [id],
      ),
    ).toMatchObject({
      id,
      dieselLitres: 12.5,
      notes: 'done',
      removePlannedAssignmentIds: [id],
    });
  });

  it('gates actions by status and permission and labels queue counts', () => {
    const can = () => true;
    expect(jobCapabilities({ status: 'active' } as JobDetail, can)).toMatchObject({
      editSetup: true,
      complete: true,
      editSignOffDetails: false,
      editMeasures: true,
      editChargeLines: true,
      patchTravel: true,
      resolveGaps: true,
    });
    expect(jobCapabilities({ status: 'priced' } as JobDetail, can)).toMatchObject({
      signOff: true,
      editMeasures: false,
      editChargeLines: false,
      editSignOffDetails: true,
      editDieselLitres: false,
      patchTravel: false,
      price: false,
      seePricing: true,
    });
    expect(jobCapabilities({ status: 'invoiced' } as JobDetail, can)).toMatchObject({
      editSetup: false,
      complete: false,
      amendReadings: false,
      cancel: false,
      editMeasures: false,
      patchTravel: false,
    });
    const workshopCan = (permission: string) => permission === 'contracting_job:read';
    expect(jobCapabilities({ status: 'active' } as JobDetail, workshopCan)).toMatchObject({
      signOff: false,
      editMeasures: false,
      patchTravel: false,
    });
    expect(queueTabLabel('looks-finished', { 'looks-finished': 2 } as never)).toBe('Looks finished (2)');
  });

  it('lets Invoicing read a Priced Job’s money and stamp it, and nothing else', () => {
    const invoicingCan = (permission: string) =>
      permission === 'contracting_job:read-priced' || permission === 'contracting_invoice:update';
    const granted = (capabilities: Record<string, boolean>) =>
      Object.entries(capabilities)
        .filter(([, allowed]) => allowed)
        .map(([name]) => name);
    expect(granted(jobCapabilities({ status: 'priced' } as JobDetail, invoicingCan))).toEqual([
      'seePricing',
      'stampInvoice',
    ]);
    expect(granted(jobCapabilities({ status: 'invoiced' } as JobDetail, invoicingCan))).toEqual(['seePricing']);
    const managerCan = (permission: string) => permission !== 'contracting_invoice:update';
    expect(jobCapabilities({ status: 'priced' } as JobDetail, managerCan).stampInvoice).toBe(false);
  });
});
