import { type Db, user } from '@pkg/db';
import {
  contractingCategories,
  contractingCustomers,
  contractingFarms,
  contractingImplements,
  contractingJobs,
  contractingMachines,
} from '@pkg/db/contracting';
import type { KeytermCandidate } from '@pkg/schema';
import { and, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import type { TranscriptionProfile } from '../../transcriptions/transcription-profile.js';

const RECENT_JOB_DAYS = 90;
const FIELD_ROLES = ['driver', 'mechanic', 'foreman'] as const;

/**
 * Proper nouns a Contracting speech call should expect — fleet, people, places — each with where it came from, in the
 * order the speech prompt takes them. Deterministic; the taught hint keyterms are put before it by the pipeline.
 */
async function loadContractingKeytermCandidates({
  db,
  now = new Date(),
}: {
  db: Db;
  now?: Date;
}): Promise<KeytermCandidate[]> {
  const since = new Date(now.getTime() - RECENT_JOB_DAYS * 24 * 60 * 60 * 1000);
  const [machines, implementCodes, categories, people, places] = await Promise.all([
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

  const sourced = (source: string, keyterms: readonly (string | null)[]) =>
    keyterms.flatMap((keyterm) => (keyterm === null ? [] : [{ keyterm, source }]));
  return [
    ...sourced(
      'machine',
      machines.flatMap((machine) => [machine.code, machine.make, machine.model]),
    ),
    ...sourced(
      'implement',
      implementCodes.map((implement) => implement.code),
    ),
    ...sourced(
      'category',
      categories.map((category) => category.name),
    ),
    ...sourced(
      'person',
      people.flatMap((person) => [person.name, person.name.trim().split(/\s+/)[0] ?? null]),
    ),
    ...places.flatMap((place) => [...sourced('farm', [place.farm]), ...sourced('customer', [place.customer])]),
  ];
}

/** Contracting's part of the Voice Note pipeline. */
export const contractingTranscriptionProfile: TranscriptionProfile = {
  setting: 'a short voice note from a South African farm or workshop',
  loadVocabulary: loadContractingKeytermCandidates,
};
