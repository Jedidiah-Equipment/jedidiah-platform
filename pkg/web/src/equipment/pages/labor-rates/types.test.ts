import { WORK_ITEM_DEPARTMENTS } from '@pkg/schema/equipment';
import { expect, test } from 'vitest';
import { parseLaborRateForm } from './types.js';

function formData() {
  const data = new FormData();
  data.set('hoursPerWorkingDay', '9');
  data.set('managementOverheadPercentage', '150');
  for (const department of WORK_ITEM_DEPARTMENTS) {
    data.set(`${department}.billingRate`, '');
    data.set(`${department}.costToCompanyRate`, '0');
    data.set(`${department}.consumablesPercentage`, '125');
  }
  return data;
}

test('preserves deliberate blanks, zeros, decimal rates and percentages over 100 in a complete save', () => {
  const data = formData();
  data.set('paint.billingRate', ' 410.25 ');
  data.set('workshop.consumablesPercentage', '');
  const result = parseLaborRateForm(data);
  expect(result.success).toBe(true);
  if (!result.success) throw result.error;
  expect(result.data.rates.find((row) => row.department === 'paint')).toEqual({
    department: 'paint',
    billingRate: 410.25,
    costToCompanyRate: 0,
    consumablesPercentage: 125,
  });
  expect(result.data.rates.find((row) => row.department === 'workshop')).toEqual({
    department: 'workshop',
    billingRate: null,
    costToCompanyRate: 0,
    consumablesPercentage: null,
  });
  expect(result.data).toMatchObject({ hoursPerWorkingDay: 9, managementOverheadPercentage: 150 });
});

test('refuses missing controls or invalid settings instead of silently clearing saved values', () => {
  const missing = formData();
  missing.delete('fabrication.billingRate');
  expect(parseLaborRateForm(missing).success).toBe(false);
  for (const [field, value] of [
    ['hoursPerWorkingDay', ''],
    ['hoursPerWorkingDay', '25'],
    ['managementOverheadPercentage', '-1'],
    ['paint.billingRate', '1.001'],
  ]) {
    const data = formData();
    if (!field || value === undefined) throw new Error('Invalid fixture');
    data.set(field, value);
    expect(parseLaborRateForm(data).success, `${field}=${value}`).toBe(false);
  }
});
