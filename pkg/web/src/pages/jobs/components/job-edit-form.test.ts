import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { toJobEditFormValues, toJobUpdateInput } from './job-edit-form.js';

const JOB_ID = '00000000-0000-4000-8000-000000000001';

describe('toJobEditFormValues', () => {
  it('maps null fields to empty strings', () => {
    expect(toJobEditFormValues({ completedOn: null, description: null, invoiceNumber: null, vinNumber: null })).toEqual(
      {
        completedOn: '',
        description: '',
        invoiceNumber: '',
        vinNumber: '',
      },
    );
  });

  it('keeps populated fields', () => {
    expect(
      toJobEditFormValues({
        completedOn: DateOnlyIso.parse('2026-07-01'),
        description: 'Fit the extended tank.',
        invoiceNumber: 'INV-1001',
        vinNumber: 'VIN-123',
      }),
    ).toEqual({
      completedOn: '2026-07-01',
      description: 'Fit the extended tank.',
      invoiceNumber: 'INV-1001',
      vinNumber: 'VIN-123',
    });
  });
});

describe('toJobUpdateInput', () => {
  it('turns blank inputs into nulls', () => {
    expect(
      toJobUpdateInput(JOB_ID, { completedOn: '', description: '', invoiceNumber: '  ', vinNumber: '  ' }),
    ).toEqual({
      id: JOB_ID,
      completedOn: null,
      description: null,
      invoiceNumber: null,
      vinNumber: null,
    });
  });

  it('trims and keeps populated inputs', () => {
    expect(
      toJobUpdateInput(JOB_ID, {
        completedOn: '2026-07-01',
        description: ' Fit the extended tank. ',
        invoiceNumber: ' INV-1001 ',
        vinNumber: 'VIN-123',
      }),
    ).toEqual({
      id: JOB_ID,
      completedOn: '2026-07-01',
      description: 'Fit the extended tank.',
      invoiceNumber: 'INV-1001',
      vinNumber: 'VIN-123',
    });
  });
});
