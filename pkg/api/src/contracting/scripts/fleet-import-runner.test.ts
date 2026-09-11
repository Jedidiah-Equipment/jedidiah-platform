import { fileURLToPath } from 'node:url';
import { listImplements, listMachines } from '@pkg/core/contracting';
import { eq, user } from '@pkg/db';
import { contractingHourReadings } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { parseFleetImport, placeholderEmail, readFleetImportFiles } from './fleet-import-csv.js';
import { runFleetImport } from './fleet-import-runner.js';

const actorUserId = 'fleet-import-actor' as AuthId;

const test = createTester(async ({ auth, db }) => {
  await db.insert(user).values({
    id: actorUserId,
    name: 'Import Actor',
    email: 'actor@example.com',
    emailVerified: true,
    contractingRole: 'contracting-admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const data = parseFleetImport(
    await readFleetImportFiles(fileURLToPath(new URL('./fleet-import-sample/', import.meta.url))),
  );
  return { auth, db, data };
});

test('loads the sample sheet through the app services and changes nothing on a rerun', async ({ context }) => {
  const { auth, db, data } = context;
  const first = await runFleetImport({ db, auth, actorUserId, data });
  expect(first).toEqual({
    categories: { created: 4, updated: 0, unchanged: 0, skipped: 0 },
    people: { created: 3, updated: 0, unchanged: 0, skipped: 0 },
    machines: { created: 3, updated: 0, unchanged: 0, skipped: 0 },
    implements: { created: 3, updated: 0, unchanged: 0, skipped: 0 },
    warnings: [],
  });

  const machines = await listMachines({ db, input: { status: 'all', search: '' } });
  expect(machines.map((machine) => [machine.code, machine.categoryName, machine.currentDriverName])).toEqual([
    ['JD140-1', 'Tractor', 'Sample Driver Two'],
    ['JD140-2', 'Tractor', null],
    ['KOL220-1', 'Excavator', 'Sample Driver One'],
  ]);
  expect(machines.find((machine) => machine.code === 'KOL220-1')).toMatchObject({
    year: 2019,
    serviceIntervalHours: 500,
    nextServiceDueHours: 4500,
  });
  const implementRows = await listImplements({ db, input: { status: 'all', search: '' } });
  expect(implementRows.map((implement) => [implement.code, implement.categoryName]).sort()).toEqual([
    ['BGTA-1', 'Gravel Trailer'],
    ['GRAVEL-TRAILER-1', 'Gravel Trailer'],
    ['JD670-1', 'Disc'],
  ]);
  const [driver] = await db
    .select()
    .from(user)
    .where(eq(user.email, placeholderEmail('Sample Driver One')));
  expect(driver).toMatchObject({ contractingRole: 'driver', role: null, phoneNumber: '+27820000001' });
  expect(await db.select().from(contractingHourReadings)).toEqual([]);

  const second = await runFleetImport({ db, auth, actorUserId, data });
  expect(second).toEqual({
    categories: { created: 0, updated: 0, unchanged: 4, skipped: 0 },
    people: { created: 0, updated: 0, unchanged: 3, skipped: 0 },
    machines: { created: 0, updated: 0, unchanged: 3, skipped: 0 },
    implements: { created: 0, updated: 0, unchanged: 3, skipped: 0 },
    warnings: [],
  });
  expect(await listMachines({ db, input: { status: 'all', search: '' } })).toEqual(machines);
  expect((await listImplements({ db, input: { status: 'all', search: '' } })).length).toBe(3);
});

test('patches what the sheet changed and warns about a person whose role no longer matches', async ({ context }) => {
  const { auth, db, data } = context;
  await runFleetImport({ db, auth, actorUserId, data });
  const changed = {
    ...data,
    machines: data.machines.map((machine) =>
      machine.code === 'JD140-2'
        ? { ...machine, registration: 'NEW 1 GP', current_driver: 'Sample Driver One' }
        : machine,
    ),
    people: data.people.map((person) =>
      person.name === 'Sample Mechanic' ? { ...person, role: 'driver' as const } : person,
    ),
  };
  const summary = await runFleetImport({ db, auth, actorUserId, data: changed });
  expect(summary.machines).toEqual({ created: 0, updated: 1, unchanged: 2, skipped: 0 });
  expect(summary.people).toEqual({ created: 0, updated: 0, unchanged: 2, skipped: 1 });
  expect(summary.warnings).toEqual(['people: Sample Mechanic already exists as mechanic, not driver; left as is']);
  expect(
    (await listMachines({ db, input: { status: 'all', search: '' } })).find((machine) => machine.code === 'JD140-2'),
  ).toMatchObject({ registration: 'NEW 1 GP', currentDriverName: 'Sample Driver One' });
});
