import { randomBytes } from 'node:crypto';
import {
  createCategory,
  createImplement,
  createMachine,
  listCategories,
  listImplements,
  listMachines,
  patchCategory,
  patchImplement,
  patchMachine,
  suggestImplementCode,
} from '@pkg/core/contracting';
import { type Db, eq, user } from '@pkg/db';
import { implementCodePrefix } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import type { Category, Implement, Machine } from '@pkg/schema/contracting';
import type { Auth } from '@/auth/auth.js';
import {
  categoryKey,
  type FleetImportData,
  type FleetImportImplement,
  type FleetImportMachine,
  placeholderEmail,
} from './fleet-import-csv.js';

export type FleetImportCounts = { created: number; updated: number; unchanged: number; skipped: number };
export type FleetImportSummary = {
  categories: FleetImportCounts;
  people: FleetImportCounts;
  machines: FleetImportCounts;
  implements: FleetImportCounts;
  warnings: string[];
};

const key = (value: string) => value.trim().toLowerCase();
const zeroCounts = (): FleetImportCounts => ({ created: 0, updated: 0, unchanged: 0, skipped: 0 });
type ImportScope = { db: Db; actorUserId: AuthId; data: FleetImportData; summary: FleetImportSummary };

/** Every write goes through the app's own services, so a rerun finds each row by its natural key. */
export async function runFleetImport({
  db,
  auth,
  actorUserId,
  data,
}: {
  db: Db;
  auth: Auth;
  actorUserId: AuthId;
  data: FleetImportData;
}): Promise<FleetImportSummary> {
  const summary: FleetImportSummary = {
    categories: zeroCounts(),
    people: zeroCounts(),
    machines: zeroCounts(),
    implements: zeroCounts(),
    warnings: [],
  };
  const scope: ImportScope = { db, actorUserId, data, summary };
  const categoryIds = await importCategories(scope);
  const driverIds = await importPeople({ db, auth, data, summary });
  await importMachines(scope, categoryIds, driverIds);
  await importImplements(scope, categoryIds);
  return summary;
}

async function importCategories({ db, actorUserId, data, summary }: ImportScope) {
  const existing = new Map<string, Category>();
  for (const category of await listCategories({ db }))
    existing.set(categoryKey(category.kind, category.name), category);
  const ids = new Map<string, string>();
  for (const row of data.categories) {
    const current = existing.get(categoryKey(row.kind, row.name));
    if (!current) {
      const created = await createCategory({ db, actorUserId, input: row });
      ids.set(categoryKey(row.kind, row.name), created.id);
      summary.categories.created += 1;
      continue;
    }
    ids.set(categoryKey(row.kind, row.name), current.id);
    if (current.icon === row.icon && current.colour === row.colour) summary.categories.unchanged += 1;
    else {
      await patchCategory({ db, actorUserId, input: { id: current.id, icon: row.icon, colour: row.colour } });
      summary.categories.updated += 1;
    }
  }
  return ids;
}

async function importPeople({
  db,
  auth,
  data,
  summary,
}: {
  db: Db;
  auth: Auth;
  data: FleetImportData;
  summary: FleetImportSummary;
}) {
  const driverIds = new Map<string, AuthId>();
  for (const person of data.people) {
    const email = placeholderEmail(person.name);
    const [current] = await db
      .select({ id: user.id, contractingRole: user.contractingRole, phoneNumber: user.phoneNumber })
      .from(user)
      .where(eq(user.email, email));
    if (!current) {
      const { user: created } = await auth.api.createUser({
        body: {
          email,
          name: person.name,
          password: randomBytes(24).toString('base64url'),
          data: { contractingRole: person.role, phoneNumber: person.phone },
        },
      });
      if (person.role === 'driver') driverIds.set(key(person.name), created.id as AuthId);
      summary.people.created += 1;
      continue;
    }
    if (current.contractingRole !== person.role) {
      summary.warnings.push(
        `people: ${person.name} already exists as ${current.contractingRole ?? 'a login user'}, not ${person.role}; left as is`,
      );
      summary.people.skipped += 1;
      continue;
    }
    if (person.role === 'driver') driverIds.set(key(person.name), current.id as AuthId);
    if (person.phone !== null && current.phoneNumber !== person.phone) {
      await auth.api.adminUpdateUser({ body: { userId: current.id, data: { phoneNumber: person.phone } } });
      summary.people.updated += 1;
    } else summary.people.unchanged += 1;
  }
  return driverIds;
}

function machineInput(row: FleetImportMachine, categoryId: string, currentDriverUserId: AuthId | null) {
  return {
    code: row.code,
    make: row.make,
    model: row.model,
    categoryId,
    year: row.year,
    registration: row.registration,
    currentDriverUserId,
    notes: row.notes,
    serviceIntervalHours: row.service_interval_hours,
    nextServiceDueHours: row.next_service_due_hours,
  };
}

async function importMachines(
  { db, actorUserId, data, summary }: ImportScope,
  categoryIds: Map<string, string>,
  driverIds: Map<string, AuthId>,
) {
  const existing = new Map<string, Machine>();
  for (const machine of await listMachines({ db, input: { status: 'all', search: '' } }))
    existing.set(key(machine.code), machine);
  for (const row of data.machines) {
    const categoryId = categoryIds.get(categoryKey('machine', row.category));
    if (!categoryId) throw new Error(`machines: category ${row.category} was not imported`);
    const driverId = row.current_driver ? driverIds.get(key(row.current_driver)) : null;
    if (row.current_driver && !driverId) {
      summary.warnings.push(`machines: ${row.code} keeps no driver because ${row.current_driver} was skipped`);
    }
    const input = machineInput(row, categoryId, driverId ?? null);
    const current = existing.get(key(row.code));
    if (!current) {
      await createMachine({ db, actorUserId, input });
      summary.machines.created += 1;
    } else if (current.retiredAt) {
      summary.warnings.push(`machines: ${row.code} is retired and was left alone`);
      summary.machines.skipped += 1;
    } else if (differs(current, input)) {
      await patchMachine({ db, actorUserId, input: { ...input, id: current.id } });
      summary.machines.updated += 1;
    } else summary.machines.unchanged += 1;
  }
}

async function importImplements({ db, actorUserId, data, summary }: ImportScope, categoryIds: Map<string, string>) {
  const existing = new Map<string, Implement>();
  const known = await listImplements({ db, input: { status: 'all', search: '' } });
  for (const implement of known) existing.set(key(implement.code), implement);
  const matched = new Set<string>();
  for (const row of data.implements) {
    const categoryId = categoryIds.get(categoryKey('implement', row.category));
    if (!categoryId) throw new Error(`implements: category ${row.category} was not imported`);
    const current = row.code ? existing.get(key(row.code)) : findGenerated(known, row, categoryId, matched);
    if (current) matched.add(current.id);
    if (!current) {
      const code = row.code ?? (await suggestImplementCode({ db, categoryId })).code;
      const created = await createImplement({ db, actorUserId, input: { code, categoryId, notes: row.notes } });
      known.push(created);
      summary.implements.created += 1;
    } else if (current.retiredAt) {
      summary.warnings.push(`implements: ${current.code} is retired and was left alone`);
      summary.implements.skipped += 1;
    } else if (current.categoryId !== categoryId || current.notes !== row.notes) {
      await patchImplement({ db, actorUserId, input: { id: current.id, categoryId, notes: row.notes } });
      summary.implements.updated += 1;
    } else summary.implements.unchanged += 1;
  }
}

/**
 * A row without a code cannot be found by code on a rerun, so it is matched by its category and
 * notes among the implements whose codes this script generated for that category.
 */
function findGenerated(
  known: readonly Implement[],
  row: FleetImportImplement,
  categoryId: string,
  matched: ReadonlySet<string>,
) {
  const prefix = `${implementCodePrefix(row.category)}-`;
  return known.find(
    (implement) =>
      !matched.has(implement.id) &&
      implement.categoryId === categoryId &&
      implement.code.startsWith(prefix) &&
      (implement.notes ?? null) === row.notes,
  );
}

function differs(current: Machine, input: ReturnType<typeof machineInput>) {
  return (Object.keys(input) as (keyof typeof input)[]).some((field) => current[field] !== input[field]);
}
