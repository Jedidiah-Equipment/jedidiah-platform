import { expect, test } from 'vitest';
import { withRecordMechanic } from './mechanics.js';

test("keeps a record's Mechanic in the picker once they have left the Mechanic set", () => {
  const options = [{ value: 'thabo', label: 'Thabo Nkosi' }];
  expect(withRecordMechanic(options, { primaryMechanicUserId: 'thabo', mechanicName: 'Thabo Nkosi' })).toEqual(options);
  expect(withRecordMechanic(options, { primaryMechanicUserId: 'sipho', mechanicName: 'Sipho Dlamini' })).toEqual([
    ...options,
    { value: 'sipho', label: 'Sipho Dlamini' },
  ]);
  expect(withRecordMechanic(options, { primaryMechanicUserId: null, mechanicName: null })).toEqual(options);
  expect(withRecordMechanic(options)).toEqual(options);
});
