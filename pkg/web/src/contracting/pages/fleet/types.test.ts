import { describe, expect, it } from 'vitest';
import { implementPatchInput, MachineFormValues, machinePatchInput } from './types.js';

const id = '00000000-0000-4000-8000-000000000001';
describe('fleet form mappers', () => {
  it('clears blank optional machine fields and normalizes codes without losing service sticker values', () => {
    const values = {
      code: 'jd6140m-1',
      make: 'Deere',
      model: '6140M',
      categoryId: id,
      currentDriverUserId: '',
      year: NaN,
      registration: '',
      notes: '',
      serviceIntervalHours: 250,
      nextServiceDueHours: 4250.5,
    };
    expect(machinePatchInput(id, values)).toEqual({
      id,
      code: 'JD6140M-1',
      make: 'Deere',
      model: '6140M',
      categoryId: id,
      currentDriverUserId: null,
      year: null,
      registration: null,
      notes: null,
      serviceIntervalHours: 250,
      nextServiceDueHours: 4250.5,
    });
    expect(machinePatchInput(id, { ...values, serviceIntervalHours: NaN, nextServiceDueHours: NaN })).toMatchObject({
      serviceIntervalHours: null,
      nextServiceDueHours: null,
    });
    expect(MachineFormValues.safeParse({ ...values, serviceIntervalHours: -10 }).success).toBe(false);
  });
  it('clears implement notes and keeps the implement type independent of machine categories', () => {
    expect(implementPatchInput(id, { code: 'disc-1', implementType: 'Offset disc', notes: '' })).toEqual({
      id,
      code: 'DISC-1',
      implementType: 'Offset disc',
      notes: null,
    });
  });
});
