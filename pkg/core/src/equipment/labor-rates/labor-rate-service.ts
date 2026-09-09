import type { DatabaseTransaction, Db } from '@pkg/db';
import { laborDepartmentRates, laborRateSettings } from '@pkg/db/equipment';
import { departmentLabels } from '@pkg/domain/equipment';
import type { AuthId } from '@pkg/schema';
import type { LaborRateCard, LaborRateCardUpdateInput } from '@pkg/schema/equipment';
import { WORK_ITEM_DEPARTMENTS } from '@pkg/schema/equipment';
import { defineAuditDescriptor } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';

export async function getLaborRateCard({ db }: { db: Db | DatabaseTransaction }): Promise<LaborRateCard> {
  // A single statement sees one committed revision of the card, including its settings.
  const rows = await db.select().from(laborRateSettings).crossJoin(laborDepartmentRates);
  const settings = rows[0]?.labor_rate_settings;
  if (!settings || rows.length !== WORK_ITEM_DEPARTMENTS.length) throw new Error('Labor Rate Card is not initialized.');
  return {
    hoursPerWorkingDay: settings.hoursPerWorkingDay,
    managementOverheadPercentage: settings.managementOverheadPercentage,
    rates: WORK_ITEM_DEPARTMENTS.map((department) => {
      const rate = rows.find((row) => row.labor_department_rate.id === department)?.labor_department_rate;
      if (!rate) throw new Error(`Labor rate missing for ${department}.`);
      const { id: _id, ...fields } = rate;
      return { department, ...fields };
    }),
  };
}

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
    // Lock the singleton first for every save, serializing the entire card across its child rows.
    await mutateEntity({
      db: tx,
      actorUserId,
      id: 'labor-rate-card',
      table: laborRateSettings,
      notFound: () => new Error('Labor Rate Card is not initialized.'),
      descriptor: settingsAudit,
      set: () => ({
        hoursPerWorkingDay: input.hoursPerWorkingDay,
        managementOverheadPercentage: input.managementOverheadPercentage,
      }),
      project: (_tx, row) => row,
    });
    for (const rate of input.rates) {
      await mutateEntity({
        db: tx,
        actorUserId,
        id: rate.department,
        table: laborDepartmentRates,
        notFound: () => new Error(`Labor rate missing for ${rate.department}.`),
        descriptor: departmentAudit,
        set: () => ({
          billingRate: rate.billingRate,
          costToCompanyRate: rate.costToCompanyRate,
          consumablesPercentage: rate.consumablesPercentage,
        }),
        project: (_tx, row) => row,
      });
    }
    return getLaborRateCard({ db: tx });
  });
}

const settingsAudit = defineAuditDescriptor<typeof laborRateSettings.$inferSelect>({
  entityType: 'labor_rate_card',
  noun: 'Labor Rate Card',
  primaryLabelField: 'id',
  entityId: (row) => row.id,
  label: () => 'Settings',
  toRecord: ({ hoursPerWorkingDay, managementOverheadPercentage }) => ({
    hoursPerWorkingDay,
    managementOverheadPercentage,
  }),
});
const departmentAudit = defineAuditDescriptor<typeof laborDepartmentRates.$inferSelect>({
  entityType: 'labor_rate_card',
  noun: 'Labor Rate Card',
  primaryLabelField: 'id',
  entityId: (row) => row.id,
  label: (row) => departmentLabels[row.id],
  toRecord: ({ billingRate, costToCompanyRate, consumablesPercentage }) => ({
    billingRate,
    costToCompanyRate,
    consumablesPercentage,
  }),
});
