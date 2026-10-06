import { type Db, user } from '@pkg/db';
import {
  contractingCategories,
  contractingCustomers,
  contractingFarms,
  contractingImplements,
  contractingJobs,
  contractingMachines,
  contractingTranscriptionHints,
} from '@pkg/db/contracting';
import { shapeKeyterms } from '@pkg/domain/contracting';
import { and, eq, gte, inArray, isNotNull, isNull, or } from 'drizzle-orm';

const RECENT_JOB_DAYS = 90;
const FIELD_ROLES = ['driver', 'mechanic', 'foreman'] as const;

/** Proper nouns the speech service should expect: fleet, people, places. Deterministic; the hint keyterms join it. */
export async function loadKeyterms({ db, now = new Date() }: { db: Db; now?: Date }): Promise<string[]> {
  const since = new Date(now.getTime() - RECENT_JOB_DAYS * 24 * 60 * 60 * 1000);
  const [hints, machines, implementCodes, categories, people, places] = await Promise.all([
    db
      .select({ keyterm: contractingTranscriptionHints.keyterm })
      .from(contractingTranscriptionHints)
      .where(and(isNull(contractingTranscriptionHints.retiredAt), isNotNull(contractingTranscriptionHints.keyterm)))
      .orderBy(contractingTranscriptionHints.createdAt),
    db
      .select({ code: contractingMachines.code, make: contractingMachines.make, model: contractingMachines.model })
      .from(contractingMachines)
      .where(isNull(contractingMachines.retiredAt))
      .orderBy(contractingMachines.code),
    db
      .select({ code: contractingImplements.code })
      .from(contractingImplements)
      .where(isNull(contractingImplements.retiredAt))
      .orderBy(contractingImplements.code),
    db.select({ name: contractingCategories.name }).from(contractingCategories).orderBy(contractingCategories.name),
    db
      .select({ name: user.name })
      .from(user)
      .where(
        and(
          inArray(user.contractingRole, FIELD_ROLES),
          eq(user.isDevice, false),
          or(isNull(user.banned), eq(user.banned, false)),
        ),
      )
      .orderBy(user.name),
    db
      .selectDistinct({ farm: contractingFarms.name, customer: contractingCustomers.name })
      .from(contractingJobs)
      .innerJoin(contractingFarms, eq(contractingFarms.id, contractingJobs.farmId))
      .innerJoin(contractingCustomers, eq(contractingCustomers.id, contractingJobs.customerId))
      .where(gte(contractingJobs.updatedAt, since))
      .orderBy(contractingFarms.name, contractingCustomers.name),
  ]);

  // Learned hints come first so the cap never crowds out a correction someone taught.
  return shapeKeyterms([
    ...hints.map((hint) => hint.keyterm),
    ...machines.flatMap((machine) => [machine.code, machine.make, machine.model]),
    ...implementCodes.map((implement) => implement.code),
    ...categories.map((category) => category.name),
    ...people.flatMap((person) => [person.name, person.name.trim().split(/\s+/)[0]]),
    ...places.flatMap((place) => [place.farm, place.customer]),
  ]);
}

/** Serves one registry per TTL so a note never costs a fleet sweep. */
export function createKeytermCache(
  load: () => Promise<string[]>,
  ttlMs = 5 * 60_000,
  clock: () => number = Date.now,
): { current: () => Promise<string[]>; invalidate: () => void } {
  let cached: { at: number; keyterms: Promise<string[]> } | null = null;

  return {
    current: () => {
      if (!cached || clock() - cached.at >= ttlMs) {
        const keyterms = load();
        const entry = { at: clock(), keyterms };
        cached = entry;
        // A failed load is not cached: the next note tries again.
        keyterms.catch(() => {
          if (cached === entry) cached = null;
        });
      }

      return cached.keyterms;
    },
    invalidate: () => {
      cached = null;
    },
  };
}
