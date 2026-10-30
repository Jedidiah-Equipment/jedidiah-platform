import { user } from '@pkg/db';
import { contractingMachines } from '@pkg/db/contracting';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { seedJobFixtures } from '../test/job-fixtures.js';
import { contractingTranscriptionProfile } from './transcription-profile.js';

const test = createTester(async ({ db }) => ({ fixtures: await seedJobFixtures(db) }));

test('names the working fleet, field people and recent places', async ({ context: { db, fixtures } }) => {
  const now = new Date();
  const person = (
    id: string,
    name: string,
    contractingRole: 'mechanic' | 'workshop-manager' | 'driver',
    isDevice = false,
  ) => ({
    id,
    name,
    email: `${id}@example.com`,
    emailVerified: true,
    contractingRole,
    isDevice,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(user)
    .values([
      person('mechanic-1', 'Thabo Nkosi', 'mechanic'),
      person('workshop', 'Connor Botha', 'workshop-manager'),
      person('yard-tablet', 'Yard Tablet', 'driver', true),
    ]);
  await db
    .update(contractingMachines)
    .set({ retiredAt: now, retiredReason: 'Sold' })
    .where(eq(contractingMachines.id, fixtures.tipper.id));

  const candidates = await contractingTranscriptionProfile.loadVocabulary({ db, now });
  const keyterms = candidates.map((candidate) => candidate.keyterm);

  expect(keyterms).toEqual(expect.arrayContaining(['CAT320-1', 'Thabo Nkosi', 'Thabo', 'Connor Botha', 'Sipho']));
  expect(keyterms).not.toEqual(expect.arrayContaining(['TIP-7']));
  expect(keyterms).not.toContain('Yard Tablet');
  expect(candidates.map((candidate) => candidate.source)).not.toContain('Hint keyterm');
  expect(candidates).toEqual(
    expect.arrayContaining([
      { keyterm: 'CAT320-1', source: 'Machine' },
      { keyterm: 'Thabo', source: 'Person' },
    ]),
  );
});
