import { describe, expect, test } from 'vitest';
import { deriveNewJob, EMPTY_JOB_DRAFT } from './new-job-form';

const id = '0b8e3f1c-6a52-4c1e-9d3a-2f6b7c8d9e01';
const complete = { customerId: id, farmId: id, workTypeId: id, description: 'Dam wall', foremanUserId: '' };

describe('deriveNewJob', () => {
  test('names the first choice still missing and offers no save', () => {
    expect(deriveNewJob({ ...EMPTY_JOB_DRAFT, customerId: id }, { canCreate: true, busy: false })).toEqual({
      input: null,
      message: 'Choose a Farm',
    });
  });

  test('saves a complete draft only when allowed and idle', () => {
    expect(deriveNewJob(complete, { canCreate: true, busy: false })).toEqual({
      input: { customerId: id, farmId: id, workTypeId: id, description: 'Dam wall', foremanUserId: null },
    });
    expect(deriveNewJob(complete, { canCreate: true, busy: true })).toEqual({ input: null });
    expect(deriveNewJob(complete, { canCreate: false, busy: false })).toEqual({ input: null });
  });
});
