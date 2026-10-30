import { describe, expect, it } from 'vitest';
import { OpenServiceValues, openServiceFields } from './service-open-form.js';

describe('the Book a service form', () => {
  it('asks for the start date, and books with no Mechanic yet as none', () => {
    expect(
      OpenServiceValues.safeParse({ startDate: '', primaryMechanicUserId: '', notes: '' }).error?.issues.map(
        (issue) => issue.message,
      ),
    ).toEqual(['Choose the start date']);
    expect(openServiceFields({ startDate: '2026-10-30', primaryMechanicUserId: '', notes: 'Oil leak' })).toEqual({
      startDate: '2026-10-30',
      primaryMechanicUserId: null,
      notes: 'Oil leak',
    });
  });
});
