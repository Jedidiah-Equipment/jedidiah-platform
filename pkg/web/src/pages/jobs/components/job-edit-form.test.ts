import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { toJobEditFormValues, toJobUpdateInput } from './job-edit-form.js';

const JOB_ID = '00000000-0000-4000-8000-000000000001';

describe('toJobEditFormValues', () => {
  it('maps null fields to empty strings', () => {
    expect(toJobEditFormValues({ completedOn: null, description: null })).toEqual({
      completedOn: '',
      description: '',
    });
  });

  it('keeps populated fields', () => {
    expect(
      toJobEditFormValues({
        completedOn: DateOnlyIso.parse('2026-07-01'),
        description: 'Fit the extended tank.',
      }),
    ).toEqual({
      completedOn: '2026-07-01',
      description: 'Fit the extended tank.',
    });
  });
});

describe('toJobUpdateInput', () => {
  it('turns blank inputs into nulls', () => {
    expect(toJobUpdateInput(JOB_ID, { completedOn: '', description: '' })).toEqual({
      id: JOB_ID,
      completedOn: null,
      description: null,
    });
  });

  it('trims and keeps populated inputs', () => {
    expect(
      toJobUpdateInput(JOB_ID, {
        completedOn: '2026-07-01',
        description: ' Fit the extended tank. ',
      }),
    ).toEqual({
      id: JOB_ID,
      completedOn: '2026-07-01',
      description: 'Fit the extended tank.',
    });
  });
});
