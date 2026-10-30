import type { ContractingSettings } from '@pkg/schema/contracting';
import { expect, test } from 'vitest';
import { SettingsFormValues, settingsFormToInput, settingsFormValues } from './types.js';

const settings: ContractingSettings = {
  travelFlagThresholdHours: 4,
  johnDeereDifferenceThresholdHours: 10,
  serviceDueSoonThresholdHours: 100,
  utilisationTargetPercent: null,
  updatedAt: '2026-10-12T08:00:00.000Z' as ContractingSettings['updatedAt'],
};

test('an empty Utilisation Target is NaN in the form and null on the wire, both ways', () => {
  const values = settingsFormValues(settings);
  expect(values.utilisationTargetPercent).toBeNaN();
  expect(settingsFormToInput(SettingsFormValues.parse(values))).toEqual({
    travelFlagThresholdHours: 4,
    johnDeereDifferenceThresholdHours: 10,
    serviceDueSoonThresholdHours: 100,
    utilisationTargetPercent: null,
  });
  expect(settingsFormValues({ ...settings, utilisationTargetPercent: 70 }).utilisationTargetPercent).toBe(70);
  expect(settingsFormToInput({ ...values, utilisationTargetPercent: 70 }).utilisationTargetPercent).toBe(70);
});

test('rejects blanks in the thresholds and values outside the schema bounds', () => {
  const values = settingsFormValues(settings);
  for (const invalid of [
    { ...values, travelFlagThresholdHours: NaN },
    { ...values, travelFlagThresholdHours: 0.4 },
    { ...values, travelFlagThresholdHours: 4.25 },
    { ...values, johnDeereDifferenceThresholdHours: 0.5 },
    { ...values, serviceDueSoonThresholdHours: NaN },
    { ...values, serviceDueSoonThresholdHours: 100.5 },
    { ...values, utilisationTargetPercent: 0 },
    { ...values, utilisationTargetPercent: 101 },
  ])
    expect(SettingsFormValues.safeParse(invalid).success).toBe(false);
  expect(
    SettingsFormValues.safeParse({ ...values, travelFlagThresholdHours: 48, utilisationTargetPercent: 1 }).success,
  ).toBe(true);
});
