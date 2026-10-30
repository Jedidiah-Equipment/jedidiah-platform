import type { DatabaseTransaction, Db } from '@pkg/db';
import { CONTRACTING_SETTINGS_ID, contractingSettings } from '@pkg/db/contracting';
import type { AuthId } from '@pkg/schema';
import { ContractingSettings, type ContractingSettingsUpdateInput } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { defineAuditDescriptor } from '../../audit/audit-writer.js';
import { mutateEntity } from '../../audit/mutate-entity.js';

type DbOrTx = Db | DatabaseTransaction;

const descriptor = defineAuditDescriptor<typeof contractingSettings.$inferSelect>({
  entityType: 'contracting_settings',
  noun: 'Settings',
  primaryLabelField: 'label',
  entityId: () => CONTRACTING_SETTINGS_ID,
  label: () => 'Contracting Settings',
  toRecord: ({
    travelFlagThresholdHours,
    johnDeereDifferenceThresholdHours,
    serviceDueSoonThresholdHours,
    utilisationTargetPercent,
  }) => ({
    travelFlagThresholdHours,
    johnDeereDifferenceThresholdHours,
    serviceDueSoonThresholdHours,
    utilisationTargetPercent,
  }),
});

/** The migration seeds the row, so a miss is a broken database, not a user error. */
const notInitialized = () => new Error('Contracting Settings are not initialized.');

const toSettings = (row: typeof contractingSettings.$inferSelect): ContractingSettings =>
  ContractingSettings.parse({
    travelFlagThresholdHours: row.travelFlagThresholdHours,
    johnDeereDifferenceThresholdHours: row.johnDeereDifferenceThresholdHours,
    serviceDueSoonThresholdHours: row.serviceDueSoonThresholdHours,
    utilisationTargetPercent: row.utilisationTargetPercent,
    updatedAt: row.updatedAt.toISOString(),
  });

/** The one row. */
export async function getContractingSettings({ db }: { db: DbOrTx }): Promise<ContractingSettings> {
  const [row] = await db.select().from(contractingSettings).where(eq(contractingSettings.id, CONTRACTING_SETTINGS_ID));
  if (!row) throw notInitialized();
  return toSettings(row);
}

export async function updateContractingSettings({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: ContractingSettingsUpdateInput;
}): Promise<ContractingSettings> {
  return mutateEntity({
    actorUserId,
    db,
    descriptor,
    id: CONTRACTING_SETTINGS_ID,
    notFound: notInitialized,
    project: (_tx, row) => toSettings(row),
    set: () => ({ ...input, updatedAt: new Date() }),
    table: contractingSettings,
  });
}
