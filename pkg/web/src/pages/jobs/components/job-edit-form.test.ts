import { describe, expect, it } from 'vitest';

import { toJobEditFormValues, toJobUpdateInput } from './job-edit-form.js';

const JOB_ID = '00000000-0000-4000-8000-000000000001';

describe('toJobEditFormValues', () => {
  it('maps null fields to empty strings', () => {
    expect(toJobEditFormValues({ description: null, vinNumber: null })).toEqual({
      description: '',
      vinNumber: '',
    });
  });

  it('keeps populated fields', () => {
    expect(toJobEditFormValues({ description: 'Fit the extended tank.', vinNumber: 'VIN-123' })).toEqual({
      description: 'Fit the extended tank.',
      vinNumber: 'VIN-123',
    });
  });
});

describe('toJobUpdateInput', () => {
  it('turns blank inputs into nulls', () => {
    expect(toJobUpdateInput(JOB_ID, { description: '', vinNumber: '  ' })).toEqual({
      id: JOB_ID,
      description: null,
      vinNumber: null,
    });
  });

  it('trims and keeps populated inputs', () => {
    expect(toJobUpdateInput(JOB_ID, { description: ' Fit the extended tank. ', vinNumber: 'VIN-123' })).toEqual({
      id: JOB_ID,
      description: 'Fit the extended tank.',
      vinNumber: 'VIN-123',
    });
  });
});
