import { auditEvents, user } from '@pkg/db';
import { contractingSettings } from '@pkg/db/contracting';
import { CONTRACTING_SETTINGS_DEFAULTS } from '@pkg/domain/contracting';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { getContractingSettings, updateContractingSettings } from './settings-service.js';

const actorUserId = 'settings-admin';

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: actorUserId,
    name: 'Jed',
    email: 'settings@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const settingsEvents = () => db.select().from(auditEvents).where(eq(auditEvents.entityType, 'contracting_settings'));
  return { settingsEvents };
});

test('reads the migration-seeded row back as the defaults', async ({ context: { db } }) => {
  expect(await getContractingSettings({ db })).toMatchObject(CONTRACTING_SETTINGS_DEFAULTS);
});

test('a save replaces all three values, stamps updatedAt and records one audit event; a no-op records none', async ({
  context: { db, settingsEvents },
}) => {
  const before = await getContractingSettings({ db });
  const input = { gapFlagThresholdHours: 2.5, serviceDueSoonThresholdHours: 150, utilisationTargetPercent: 70 };
  const saved = await updateContractingSettings({ db, actorUserId, input });
  expect(saved).toMatchObject(input);
  expect(Date.parse(saved.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
  expect(await getContractingSettings({ db })).toEqual(saved);
  const [event, ...rest] = await settingsEvents();
  expect(rest).toEqual([]);
  expect(event).toMatchObject({
    actorUserId,
    entityId: 'contracting',
    changes: {
      gapFlagThresholdHours: { from: 4, to: 2.5 },
      serviceDueSoonThresholdHours: { from: 100, to: 150 },
      utilisationTargetPercent: { from: null, to: 70 },
    },
  });

  await updateContractingSettings({ db, actorUserId, input });
  expect((await settingsEvents()).length).toBe(1);
  expect((await getContractingSettings({ db })).updatedAt).toBe(saved.updatedAt);
});

test('the database refuses a value outside the bounds and a second row', async ({ context: { db } }) => {
  const refused = (constraint: string) => ({ cause: { constraint_name: constraint } });
  await expect(db.update(contractingSettings).set({ gapFlagThresholdHours: 0.4 })).rejects.toMatchObject(
    refused('settings_gap_flag_threshold_bounds'),
  );
  await expect(db.update(contractingSettings).set({ serviceDueSoonThresholdHours: 1001 })).rejects.toMatchObject(
    refused('settings_service_due_soon_threshold_bounds'),
  );
  await expect(db.update(contractingSettings).set({ utilisationTargetPercent: 0 })).rejects.toMatchObject(
    refused('settings_utilisation_target_bounds'),
  );
  await expect(db.insert(contractingSettings).values({ id: 'other' })).rejects.toMatchObject(
    refused('settings_singleton'),
  );
});
