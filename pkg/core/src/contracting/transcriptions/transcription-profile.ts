import { type Db, user } from '@pkg/db';
import {
  contractingCategories,
  contractingCustomers,
  contractingFarms,
  contractingImplements,
  contractingJobs,
  contractingMachines,
} from '@pkg/db/contracting';
import { personKeyterms, sourcedKeyterms } from '@pkg/domain';
import type { KeytermCandidate } from '@pkg/schema';
import { subDays } from 'date-fns';
import { and, eq, gte, inArray, isNull } from 'drizzle-orm';
import type { TranscriptionProfile } from '../../transcriptions/transcription-profile.js';
import { activePersonCondition } from '../../users/active-person.js';

const RECENT_JOB_DAYS = 90;
const KEYTERM_ROLES = ['driver', 'mechanic', 'workshop-manager', 'foreman'] as const;

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
  const since = subDays(now, RECENT_JOB_DAYS);
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
      .where(and(inArray(user.contractingRole, KEYTERM_ROLES), activePersonCondition()))
      .orderBy(user.name),
    db
      .selectDistinct({ farm: contractingFarms.name, customer: contractingCustomers.name })
      .from(contractingJobs)
      .innerJoin(contractingFarms, eq(contractingFarms.id, contractingJobs.farmId))
      .innerJoin(contractingCustomers, eq(contractingCustomers.id, contractingJobs.customerId))
      .where(gte(contractingJobs.updatedAt, since))
      .orderBy(contractingFarms.name, contractingCustomers.name),
  ]);

  return [
    ...sourcedKeyterms(
      'Machine',
      machines.flatMap((machine) => [machine.code, machine.make, machine.model]),
    ),
    ...sourcedKeyterms(
      'Implement',
      implementCodes.map((implement) => implement.code),
    ),
    ...sourcedKeyterms(
      'Category',
      categories.map((category) => category.name),
    ),
    ...personKeyterms(people.map((person) => person.name)),
    ...places.flatMap((place) => [
      ...sourcedKeyterms('Farm', [place.farm]),
      ...sourcedKeyterms('Customer', [place.customer]),
    ]),
  ];
}

/** Contracting's part of the Voice Note pipeline. */
export const contractingTranscriptionProfile: TranscriptionProfile = {
  setting: 'a short voice note from a South African farm or workshop',
  loadVocabulary: loadContractingKeytermCandidates,
};
