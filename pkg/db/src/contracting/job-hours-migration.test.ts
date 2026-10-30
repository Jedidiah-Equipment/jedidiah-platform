import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveStintHours } from '@pkg/domain/contracting';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildDatabaseUrl,
  createTestDatabaseName,
  dropTestDatabase,
  getTestTemplateDatabaseUrl,
} from '../test-utils.js';

const migrationsFolder = new URL('../../migrations', import.meta.url).pathname;
const MIGRATION = 185;

/** The migrations folder as it stood before 0185, so a database can be built in the old shape. */
function foldersBefore(idx: number) {
  const folder = mkdtempSync(join(tmpdir(), 'jedidiah-migrations-'));
  cpSync(migrationsFolder, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number }[] };
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.filter((e) => e.idx < idx) }));
  return folder;
}

async function migrateWith(databaseUrl: string, folder: string) {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: folder });
  } finally {
    await client.end();
  }
}

const databaseName = createTestDatabaseName('jedidiah_ephemeral');
let sql: postgres.Sql;
let oldFolder: string;

const at = (hour: number) => new Date(Date.UTC(2026, 9, 1, hour)).toISOString();

beforeAll(async () => {
  const templateUrl = getTestTemplateDatabaseUrl();
  const admin = postgres(templateUrl, { max: 1 });
  await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
  await admin.end();
  const databaseUrl = buildDatabaseUrl(databaseName, templateUrl);
  oldFolder = foldersBefore(MIGRATION);
  await migrateWith(databaseUrl, oldFolder);
  sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });

  await sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values ('u1', 'Sipho Dlamini', 'sipho@example.com', true, now(), now()),
           ('u2', 'Dean van Niekerk', 'dean@example.com', true, now(), now())`;
  const [customer] = await sql`insert into contracting.customer (name) values ('Boer') returning id`;
  const [farm] =
    await sql`insert into contracting.farm (customer_id, name) values (${customer?.id}, 'Plaas') returning id`;
  const [workType] = await sql`insert into contracting.work_type (name) values ('Ploughing') returning id`;
  const [category] =
    await sql`insert into contracting.category (name, kind, icon, colour) values ('Tractors', 'machine', 'excavator', 'yellow') returning id`;
  const machine = async (code: string) =>
    (
      await sql`insert into contracting.machine (code, make, model, category_id) values (${code}, 'Deere', '6R', ${category?.id}) returning id`
    )[0]?.id as string;
  const machineM = await machine('M1');
  const machineN = await machine('N1');
  const machineP = await machine('P1');
  const job = async (status: 'priced' | 'completed', code: number) =>
    (
      await sql`insert into contracting.job (code, customer_id, farm_id, work_type_id, status, start_date, end_date, completed_at, completed_by_user_id, priced_at, priced_subtotal, priced_total, diesel_amount)
        values (${code}, ${customer?.id}, ${farm?.id}, ${workType?.id}, ${status}, '2026-10-01', '2026-10-02', now(), 'u1',
          ${status === 'priced' ? sql`now()` : null}, ${status === 'priced' ? 100 : null}, ${status === 'priced' ? 100 : null}, null)
        returning id`
    )[0]?.id as string;
  const jobA = await job('priced', 1);
  const jobB = await job('completed', 2);
  const jobC = await job('completed', 3);
  const reading = async (
    machineId: string,
    role: string,
    value: number,
    hour: number,
    extra: { comment?: string; amended?: boolean; disputed?: boolean; disputedPreviousId?: string } = {},
  ) =>
    (
      await sql`insert into contracting.hour_reading (machine_id, role, value, captured_at, created_at, captured_by_user_id, method, comment, amended_by, amended_at, amendment_reason, disputed, dispute_reason, disputed_previous_id)
        values (${machineId}, ${role}, ${value}, ${at(hour)}, ${at(hour + 1)}, 'u1', 'manual', ${extra.comment ?? null},
          ${extra.amended ? 'u2' : null}, ${extra.amended ? at(hour + 2) : null}, ${extra.amended ? 'Misread' : null},
          ${extra.disputed ?? false}, ${extra.disputed ? 'The previous reading is wrong.' : null}, ${extra.disputedPreviousId ?? null})
        returning id`
    )[0]?.id as string;
  const stint = async (
    id: string,
    jobId: string,
    machineId: string,
    arrivalId: string,
    departureId: string,
    gap: { travelIncluded?: boolean; resolved?: { travel: number; unaccounted: number } } = {},
  ) =>
    sql`insert into contracting.machine_assignment (id, job_id, machine_id, arrival_reading_id, departure_reading_id, travel_included, gap_travel_hours, gap_unaccounted_hours, gap_reason, gap_resolved_at, gap_resolved_by_user_id, created_by_user_id)
      values (${id}, ${jobId}, ${machineId}, ${arrivalId}, ${departureId}, ${gap.travelIncluded ?? true},
        ${gap.resolved?.travel ?? null}, ${gap.resolved?.unaccounted ?? null}, ${gap.resolved ? 'Moved by truck' : null},
        ${gap.resolved ? at(30) : null}, ${gap.resolved ? 'u2' : null}, 'u1')`;

  await reading(machineM, 'spot', 90, 0);
  // Machine M: Job A (Priced, first arrival), Job B (an unresolved flagged gap of 6 h), Job C (a resolved gap of 10 h).
  await stint(
    '00000000-0000-4000-8000-0000000000a1',
    jobA,
    machineM,
    await reading(machineM, 'arrival', 100, 1, { comment: 'On the lowbed' }),
    await reading(machineM, 'departure', 150, 3, { amended: true }),
  );
  await stint(
    '00000000-0000-4000-8000-0000000000b1',
    jobB,
    machineM,
    await reading(machineM, 'arrival', 156, 5),
    await reading(machineM, 'departure', 170, 7),
  );
  const departureC = await reading(machineM, 'departure', 190, 11, { disputed: true });
  await stint(
    '00000000-0000-4000-8000-0000000000c1',
    jobC,
    machineM,
    await reading(machineM, 'arrival', 180, 9),
    departureC,
    { resolved: { travel: 3, unaccounted: 7 } },
  );
  await reading(machineM, 'spot', 189, 13, { disputed: true, disputedPreviousId: departureC });
  // Machine N: Job A, then Job B with travel excluded.
  await stint(
    '00000000-0000-4000-8000-0000000000a2',
    jobA,
    machineN,
    await reading(machineN, 'arrival', 30, 1),
    await reading(machineN, 'departure', 40, 3),
  );
  await stint(
    '00000000-0000-4000-8000-0000000000b2',
    jobB,
    machineN,
    await reading(machineN, 'arrival', 50, 5),
    await reading(machineN, 'departure', 60, 7),
    { travelIncluded: false },
  );

  // Machine P: a Disputed departure below its arrival, which billed no Work.
  await stint(
    '00000000-0000-4000-8000-0000000000d1',
    jobC,
    machineP,
    await reading(machineP, 'arrival', 300, 1),
    await reading(machineP, 'departure', 290, 3, { disputed: true }),
  );

  await migrateWith(databaseUrl, migrationsFolder);
});

afterAll(async () => {
  await sql?.end();
  rmSync(oldFolder, { recursive: true, force: true });
  await dropTestDatabase(databaseName);
});

describe('0185 job hours on the assignment', () => {
  it('moves each arrival and departure onto its Assignment as Job Hours and bills every stint as before', async () => {
    const stints = await sql<
      {
        id: string;
        arrivalHours: string;
        departureHours: string;
        arrivalAt: Date;
        arrivalByUserId: string;
        arrivalComment: string | null;
        travelHours: string;
        travelClamped: boolean;
        travelSetByUserId: string | null;
        hoursAmendedByUserId: string | null;
        hoursAmendmentReason: string | null;
      }[]
    >`select id, arrival_hours as "arrivalHours", departure_hours as "departureHours", arrival_at as "arrivalAt",
        arrival_by_user_id as "arrivalByUserId", arrival_comment as "arrivalComment", travel_hours as "travelHours",
        travel_clamped as "travelClamped", travel_set_by_user_id as "travelSetByUserId",
        hours_amended_by_user_id as "hoursAmendedByUserId", hours_amendment_reason as "hoursAmendmentReason"
      from contracting.machine_assignment order by id`;
    const billable = Object.fromEntries(
      stints.map((stint) => [
        stint.id.slice(-2),
        deriveStintHours({
          arrivalHours: Number(stint.arrivalHours),
          departureHours: Number(stint.departureHours),
          travelHours: Number(stint.travelHours),
        }).billableHours,
      ]),
    );
    // Work + the Travel deriveStintHours billed before: none on a first arrival, the whole flagged gap, the resolved
    // split's Travel, and nothing where travel was excluded.
    expect(billable).toEqual({ a1: 50, a2: 10, b1: 20, b2: 10, c1: 13, d1: 0 });
    const [a1, , , , c1, d1] = stints;
    expect(a1).toMatchObject({
      arrivalHours: '100.0',
      departureHours: '150.0',
      arrivalAt: new Date(at(2)),
      arrivalByUserId: 'u1',
      arrivalComment: 'On the lowbed',
      travelClamped: false,
      travelSetByUserId: null,
      hoursAmendedByUserId: 'u2',
      hoursAmendmentReason: 'Misread',
    });
    expect(c1).toMatchObject({ travelHours: '3.0', travelSetByUserId: 'u2', hoursAmendedByUserId: null });
    // A departure below its arrival lands on the arrival, marked amended by its capturer.
    expect(d1).toMatchObject({
      departureHours: '300.0',
      hoursAmendedByUserId: 'u1',
      hoursAmendmentReason:
        'Departure 290.0 h was below the arrival; set to the arrival when Job Hours moved onto the stint.',
    });
  });

  it('leaves only spot readings on the ledger, with no dispute left behind', async () => {
    const readings = await sql<{ value: string }[]>`select value from contracting.hour_reading order by value`;
    expect(readings.map((row) => row.value)).toEqual(['90.0', '189.0']);
    const columns = await sql<{ name: string }[]>`select column_name as name from information_schema.columns
      where table_schema = 'contracting' and table_name = 'hour_reading' and column_name in ('role', 'disputed')`;
    expect(columns).toEqual([]);
  });
});
