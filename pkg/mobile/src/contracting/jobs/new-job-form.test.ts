import { describe, expect, test } from 'vitest';
import { deriveNewJob, EMPTY_JOB_DRAFT } from './new-job-form';

const customerId = '0b8e3f1c-6a52-4c1e-9d3a-2f6b7c8d9e01';
const farmId = '1c9f4a2d-7b63-4d2f-8e4b-3a7c8d9e0f12';
const workTypeId = '2da05b3e-8c74-4e3a-9f5c-4b8d9e0f1a23';
const foremanUserId = 'foreman-sipho';
const ready = { canCreate: true, busy: false };

describe('deriveNewJob', () => {
  test('asks for the Customer, Farm and Work Type in form order', () => {
    expect(deriveNewJob(EMPTY_JOB_DRAFT, ready)).toEqual({ input: null, message: 'Choose a Customer' });
    expect(deriveNewJob({ ...EMPTY_JOB_DRAFT, customerId }, ready)).toEqual({ input: null, message: 'Choose a Farm' });
    expect(deriveNewJob({ ...EMPTY_JOB_DRAFT, customerId, farmId }, ready)).toEqual({
      input: null,
      message: 'Choose a Work Type',
    });
  });

  test('sends a blank description and an unchosen Foreman as none', () => {
    expect(deriveNewJob({ ...EMPTY_JOB_DRAFT, customerId, farmId, workTypeId, description: '   ' }, ready)).toEqual({
      input: { customerId, farmId, workTypeId, description: null, foremanUserId: null },
    });
  });

  test('sends the trimmed description and the chosen Foreman', () => {
    expect(deriveNewJob({ customerId, farmId, workTypeId, description: ' Dam wall ', foremanUserId }, ready)).toEqual({
      input: { customerId, farmId, workTypeId, description: 'Dam wall', foremanUserId },
    });
  });

  test('holds the save while busy or without permission, without a field message', () => {
    const complete = { customerId, farmId, workTypeId, description: '', foremanUserId: '' };
    expect(deriveNewJob(complete, { canCreate: true, busy: true })).toEqual({ input: null });
    expect(deriveNewJob(complete, { canCreate: false, busy: false })).toEqual({ input: null });
  });
});
