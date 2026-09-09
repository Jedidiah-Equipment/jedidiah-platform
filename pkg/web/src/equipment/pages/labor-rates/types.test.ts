import { type LaborRateCard, WORK_ITEM_DEPARTMENTS } from '@pkg/schema/equipment';
import { expect, test } from 'vitest';
import { LaborRateFormValues, laborRateFormToInput, laborRateFormValues } from './types.js';

function card(): LaborRateCard {
  return {
    hoursPerWorkingDay: 9,
    managementOverheadPercentage: 150,
    rates: WORK_ITEM_DEPARTMENTS.map((department) => ({
      department,
      billingRate: null,
      costToCompanyRate: 0,
      consumablesPercentage: 125,
    })),
  };
}

test('round-trips blanks and zero, and saves decimal rates and percentages over 100', () => {
  const original = card();
  const values = laborRateFormValues(original);
  expect(values.rates[0]?.billingRate).toBeNaN();
  expect(values.rates[0]?.costToCompanyRate).toBe(0);
  expect(laborRateFormToInput(values)).toEqual(original);
  const paint = values.rates.find((rate) => rate.department === 'paint');
  const workshop = values.rates.find((rate) => rate.department === 'workshop');
  if (!paint || !workshop) throw new Error('Missing fixture department');
  paint.billingRate = 410.25;
  workshop.consumablesPercentage = NaN;
  const result = laborRateFormToInput(LaborRateFormValues.parse(values));
  expect(result.rates.find((rate) => rate.department === 'paint')).toMatchObject({
    billingRate: 410.25,
    costToCompanyRate: 0,
    consumablesPercentage: 125,
  });
  expect(result.rates.find((rate) => rate.department === 'workshop')).toMatchObject({
    billingRate: null,
    consumablesPercentage: null,
  });
  expect(result).toMatchObject({ hoursPerWorkingDay: 9, managementOverheadPercentage: 150 });
});

test('rejects incomplete cards, empty required settings and values outside the API field rules', () => {
  const values = laborRateFormValues(card());
  expect(LaborRateFormValues.safeParse({ ...values, rates: values.rates.slice(1) }).success).toBe(false);
  for (const invalid of [
    { ...values, hoursPerWorkingDay: NaN },
    { ...values, hoursPerWorkingDay: 25 },
    { ...values, managementOverheadPercentage: -1 },
    { ...values, rates: values.rates.map((rate) => ({ ...rate, billingRate: 1.001 })) },
    { ...values, rates: values.rates.map((rate) => ({ ...rate, billingRate: undefined })) },
  ])
    expect(LaborRateFormValues.safeParse(invalid).success).toBe(false);
});
