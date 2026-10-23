import { type Db, user } from '@pkg/db';
import { productRanges, products, purchaseOrders, supplier } from '@pkg/db/equipment';
import { personKeyterms, sourcedKeyterms } from '@pkg/domain';
import { departmentLabels } from '@pkg/domain/equipment';
import type { KeytermCandidate } from '@pkg/schema';
import { subDays } from 'date-fns';
import { and, eq, gte, isNotNull, isNull, ne } from 'drizzle-orm';
import type { TranscriptionProfile } from '../../transcriptions/transcription-profile.js';
import { activePersonCondition } from '../../users/active-person.js';

const RECENT_DAYS = 90;

/**
 * Proper nouns an Equipment speech call should expect — people, Departments, the catalogue, recent Suppliers — in
 * the order the speech prompt takes them. Never Customers (too many), serials or part codes.
 */
async function loadEquipmentKeytermCandidates({
  db,
  now = new Date(),
}: {
  db: Db;
  now?: Date;
}): Promise<KeytermCandidate[]> {
  const since = subDays(now, RECENT_DAYS);
  const [people, productNames, rangeNames, suppliers] = await Promise.all([
    db
      .select({ name: user.name })
      .from(user)
      .where(and(isNotNull(user.role), ne(user.role, 'app-store-tester'), activePersonCondition()))
      .orderBy(user.name),
    db.select({ name: products.name }).from(products).where(isNull(products.deletedAt)).orderBy(products.name),
    db
      .select({ name: productRanges.name })
      .from(productRanges)
      .where(isNull(productRanges.deletedAt))
      .orderBy(productRanges.name),
    db
      .selectDistinct({ name: supplier.companyName })
      .from(purchaseOrders)
      .innerJoin(supplier, eq(supplier.id, purchaseOrders.supplierId))
      .where(and(gte(purchaseOrders.updatedAt, since), isNull(supplier.deletedAt)))
      .orderBy(supplier.companyName),
  ]);

  return [
    ...personKeyterms(people.map((person) => person.name)),
    ...sourcedKeyterms('Department', Object.values(departmentLabels)),
    ...sourcedKeyterms(
      'Product',
      [...productNames, ...rangeNames].map((row) => row.name),
    ),
    ...sourcedKeyterms(
      'Supplier',
      suppliers.map((row) => row.name),
    ),
  ];
}

/** Equipment's part of the Voice Note pipeline. */
export const equipmentTranscriptionProfile: TranscriptionProfile = {
  setting: "a short voice note from a South African agricultural-equipment manufacturer's workshop and sales floor",
  loadVocabulary: loadEquipmentKeytermCandidates,
};
