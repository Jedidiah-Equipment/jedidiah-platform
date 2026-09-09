import type { DatabaseTransaction, Db } from '@pkg/db';
import { laborDepartmentRates, laborRateSettings } from '@pkg/db/equipment';
import { departmentLabels } from '@pkg/domain/equipment';
import type { AuthId } from '@pkg/schema';
import type { LaborRateCard, LaborRateCardUpdateInput } from '@pkg/schema/equipment';
import { WORK_ITEM_DEPARTMENTS } from '@pkg/schema/equipment';
import { eq, sql } from 'drizzle-orm';
import { defineAuditDescriptor, diffAuditUpdate, recordAuditUpdate } from '../../audit/audit-writer.js';

const LABOR_RATE_CARD_ID = 'labor-rate-card';

export async function getLaborRateCard({
  db,
  lock = false,
}: {
  db: Db | DatabaseTransaction;
  lock?: boolean;
}): Promise<LaborRateCard> {
  // One statement reads one committed revision of the card, settings and rates together; locked, it
  // holds every row a Save rewrites, so Saves serialize on the whole card.
  const query = db.select().from(laborRateSettings).crossJoin(laborDepartmentRates);
  const rows = await (lock ? query.for('update') : query);
  const settings = rows[0]?.labor_rate_settings;
  if (!settings || rows.length !== WORK_ITEM_DEPARTMENTS.length) throw new Error('Labor Rate Card is not initialized.');
  return {
    hoursPerWorkingDay: settings.hoursPerWorkingDay,
    managementOverheadPercentage: settings.managementOverheadPercentage,
    rates: WORK_ITEM_DEPARTMENTS.map((department) => {
      const rate = rows.find((row) => row.labor_department_rate.department === department)?.labor_department_rate;
      if (!rate) throw new Error(`Labor rate missing for ${department}.`);
      return rate;
    }),
  };
}

/**
 * The card is one audited entity across its two tables, so a Save is one event: the settings fields
 * plus each Department whose rates changed. `mutateEntity` is for single rows; this is the documented
 * raw diff-and-record pair for a multi-row aggregate.
 */
export async function updateLaborRateCard({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: LaborRateCardUpdateInput;
}): Promise<LaborRateCard> {
  return db.transaction(async (tx) => {
    const before = await getLaborRateCard({ db: tx, lock: true });
    const changes = diffAuditUpdate(laborRateCardAudit, before, input);
    if (!changes) return before;

    await tx
      .update(laborRateSettings)
      .set({
        hoursPerWorkingDay: input.hoursPerWorkingDay,
        managementOverheadPercentage: input.managementOverheadPercentage,
      })
      .where(eq(laborRateSettings.id, LABOR_RATE_CARD_ID));
    await tx
      .insert(laborDepartmentRates)
      .values(input.rates)
      .onConflictDoUpdate({
        target: laborDepartmentRates.department,
        set: {
          billingRate: sql`excluded.billing_rate`,
          consumablesPercentage: sql`excluded.consumables_percentage`,
          costToCompanyRate: sql`excluded.cost_to_company_rate`,
        },
      });
    const after = await getLaborRateCard({ db: tx });
    await recordAuditUpdate({ db: tx, descriptor: laborRateCardAudit, actorUserId, after, changes });
    return after;
  });
}

const laborRateCardAudit = defineAuditDescriptor<LaborRateCard>({
  entityType: 'labor_rate_card',
  noun: 'Labor Rate Card',
  primaryLabelField: 'label',
  entityId: () => LABOR_RATE_CARD_ID,
  label: () => 'Labor Rate Card',
  toRecord: ({ hoursPerWorkingDay, managementOverheadPercentage }) => ({
    hoursPerWorkingDay,
    managementOverheadPercentage,
  }),
  toCollections: (card) => ({
    rates: card.rates.map((rate) => ({
      key: rate.department,
      label: departmentLabels[rate.department],
      value: {
        billingRate: rate.billingRate,
        consumablesPercentage: rate.consumablesPercentage,
        costToCompanyRate: rate.costToCompanyRate,
      },
    })),
  }),
});
