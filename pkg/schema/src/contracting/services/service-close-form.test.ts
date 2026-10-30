import { describe, expect, it } from 'vitest';
import { CloseServiceValues, closeServiceDefaults, closeServiceInput } from './service-close-form.js';
import { NEXT_SERVICE_DUE_BELOW_READING_MESSAGE } from './service-record.js';

const ID = '5791dc87-fe9b-4a72-9138-85f7d7ebb334';
const messages = (values: CloseServiceValues) =>
  CloseServiceValues.safeParse(values).error?.issues.map((issue) => issue.message);

describe('the Close service form', () => {
  it('asks for both hours, and refuses a Next Service Due below the reading', () => {
    const blank = closeServiceDefaults({ primaryMechanicUserId: null, notes: null }, '2026-10-30');
    expect(messages(blank)).toEqual(['Enter the reading at service', 'Enter the next service due']);
    expect(messages({ ...blank, readingAtServiceHours: 1450, nextServiceDueHours: 1400 })).toEqual([
      NEXT_SERVICE_DUE_BELOW_READING_MESSAGE,
    ]);
  });

  it('closes with no Mechanic as none', () => {
    const values = closeServiceDefaults({ primaryMechanicUserId: null, notes: 'Oil and filters' }, '2026-10-30');
    expect(closeServiceInput(ID, { ...values, readingAtServiceHours: 1450.25, nextServiceDueHours: 1700 })).toEqual({
      id: ID,
      endDate: '2026-10-30',
      readingAtServiceHours: 1450.25,
      primaryMechanicUserId: null,
      notes: 'Oil and filters',
      nextServiceDueHours: 1700,
    });
  });
});
