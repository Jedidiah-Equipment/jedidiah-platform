import { jobs } from '@pkg/db/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import {
  actorUserId,
  adjustmentInput,
  seedQuickSwitchPerson,
  seedSentPurchaseOrder,
  test,
} from '../test/inventory-fixtures.js';
import { closeOutJob } from './close-out-service.js';
import { resolveMovementActor } from './movement-actor.js';
import {
  AssertedActorDisabledError,
  AssertedActorNotFoundError,
  DeviceActorAssertedError,
  DeviceActorRequiredError,
} from './movement-actor-errors.js';
import { postReceipt } from './receipt-service.js';
import { postReturnToSupplier } from './return-to-supplier-service.js';
import { getStockMovementHistory, postAdjustment, postJobMovement } from './stock-movement-service.js';

describe('resolveMovementActor', () => {
  test('attributes the signed-in user when the caller asserts nobody', async ({ context }) => {
    await expect(
      resolveMovementActor({ assertedActorUserId: null, db: context.db, sessionUserId: actorUserId }),
    ).resolves.toBe(actorUserId);
    await expect(
      resolveMovementActor({ assertedActorUserId: undefined, db: context.db, sessionUserId: actorUserId }),
    ).resolves.toBe(actorUserId);
  });

  test('attributes the asserted person the tablet named', async ({ context }) => {
    const personId = await seedQuickSwitchPerson(context.db);

    await expect(
      resolveMovementActor({ assertedActorUserId: personId, db: context.db, sessionUserId: actorUserId }),
    ).resolves.toBe(personId);
  });

  test('refuses a person who does not exist rather than falling back to the device', async ({ context }) => {
    await expect(
      resolveMovementActor({ assertedActorUserId: 'nobody-at-all', db: context.db, sessionUserId: actorUserId }),
    ).rejects.toBeInstanceOf(AssertedActorNotFoundError);
  });

  test('refuses a disabled person, so a revoked badge stops attributing', async ({ context }) => {
    const personId = await seedQuickSwitchPerson(context.db, { banned: true, id: 'disabled-person' });

    await expect(
      resolveMovementActor({ assertedActorUserId: personId, db: context.db, sessionUserId: actorUserId }),
    ).rejects.toBeInstanceOf(AssertedActorDisabledError);
  });

  /**
   * "No person, no movements" as a rule about the record rather than about a button. The tablet
   * disables its post buttons too, but a disabled button is UX and the ledger keeps its row forever.
   */
  test('refuses a shared device that named nobody', async ({ context }) => {
    const deviceId = await seedQuickSwitchPerson(context.db, { id: 'stores-tablet', isDevice: true });

    await expect(
      resolveMovementActor({ assertedActorUserId: null, db: context.db, sessionUserId: deviceId }),
    ).rejects.toBeInstanceOf(DeviceActorRequiredError);
  });

  test('lets a device post once it names somebody', async ({ context }) => {
    const deviceId = await seedQuickSwitchPerson(context.db, { id: 'stores-tablet', isDevice: true });
    const personId = await seedQuickSwitchPerson(context.db);

    await expect(
      resolveMovementActor({ assertedActorUserId: personId, db: context.db, sessionUserId: deviceId }),
    ).resolves.toBe(personId);
  });

  /** A device is not somebody: attributing stock to one would say a machine fetched it. */
  test('refuses a device named as the actor, even from a person’s session', async ({ context }) => {
    const deviceId = await seedQuickSwitchPerson(context.db, { id: 'stores-tablet', isDevice: true });

    await expect(
      resolveMovementActor({ assertedActorUserId: deviceId, db: context.db, sessionUserId: actorUserId }),
    ).rejects.toBeInstanceOf(DeviceActorAssertedError);
  });

  test('refuses a device naming itself, which is the same lie by a shorter route', async ({ context }) => {
    const deviceId = await seedQuickSwitchPerson(context.db, { id: 'stores-tablet', isDevice: true });

    await expect(
      resolveMovementActor({ assertedActorUserId: deviceId, db: context.db, sessionUserId: deviceId }),
    ).rejects.toBeInstanceOf(DeviceActorAssertedError);
  });
});

describe('asserted actor on the tablet’s four scan flows', () => {
  test('stamps the named person on a checkout and on a return to store', async ({ context }) => {
    const personId = await seedQuickSwitchPerson(context.db);
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 10 }),
    });

    const checkout = await postJobMovement({
      actorUserId,
      db: context.db,
      input: {
        actorUserId: personId,
        jobId: context.jobs.cfo.id,
        lengthMm: null,
        partId: context.parts.piece.id,
        quantity: 2,
      },
      movementType: 'checkout',
    });
    const returned = await postJobMovement({
      actorUserId,
      db: context.db,
      input: {
        actorUserId: personId,
        jobId: context.jobs.cfo.id,
        lengthMm: null,
        partId: context.parts.piece.id,
        quantity: 1,
      },
      movementType: 'return-to-store',
    });

    expect(checkout.movement.actorUserId).toBe(personId);
    expect(returned.movement.actorUserId).toBe(personId);
  });

  test('stamps the named person on a receipt and on a return to supplier', async ({ context }) => {
    const personId = await seedQuickSwitchPerson(context.db);
    const purchaseOrderId = await seedSentPurchaseOrder(context.db, context.supplierId, [
      { partId: context.parts.piece.id, quantity: 10, unitPrice: 25 },
    ]);

    const receipt = await postReceipt({
      actorUserId,
      db: context.db,
      input: {
        actorUserId: personId,
        lengthMm: null,
        partId: context.parts.piece.id,
        purchaseOrderId,
        quantity: 10,
        unitCost: null,
      },
    });
    const returned = await postReturnToSupplier({
      actorUserId,
      db: context.db,
      input: {
        actorUserId: personId,
        lengthMm: null,
        note: null,
        partId: context.parts.piece.id,
        purchaseOrderId,
        quantity: 2,
        reason: 'defective',
      },
    });

    expect(receipt.movement.actorUserId).toBe(personId);
    expect(returned.movement.actorUserId).toBe(personId);
  });

  test('stamps the named person on a close-out', async ({ context }) => {
    const personId = await seedQuickSwitchPerson(context.db);
    await context.db.update(jobs).set({ completedOn: '2026-08-01' }).where(eq(jobs.id, context.jobs.cfo.id));

    await expect(
      closeOutJob({
        actorUserId,
        db: context.db,
        input: { actorUserId: personId, jobId: context.jobs.cfo.id, note: null },
      }),
    ).resolves.toMatchObject({ actorUserId: personId });
  });

  test('attributes the device session when nobody has been named', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 5 }),
    });

    await postJobMovement({
      actorUserId,
      db: context.db,
      input: { jobId: context.jobs.cfo.id, lengthMm: null, partId: context.parts.piece.id, quantity: 1 },
      movementType: 'checkout',
    });

    const history = await getStockMovementHistory({ db: context.db, partId: context.parts.piece.id });
    expect(history.items.at(-1)).toMatchObject({ actorUserId, movementType: 'checkout' });
  });

  /** The badge is a name, never a key: an unknown one must stop the post, not silently sign it "Tablet". */
  test('refuses the whole movement when the named person cannot be attributed to', async ({ context }) => {
    await postAdjustment({
      actorUserId,
      db: context.db,
      input: adjustmentInput(context.parts.piece.id, { delta: 5 }),
    });

    await expect(
      postJobMovement({
        actorUserId,
        db: context.db,
        input: {
          actorUserId: 'nobody-at-all',
          jobId: context.jobs.cfo.id,
          lengthMm: null,
          partId: context.parts.piece.id,
          quantity: 1,
        },
        movementType: 'checkout',
      }),
    ).rejects.toBeInstanceOf(AssertedActorNotFoundError);

    const history = await getStockMovementHistory({ db: context.db, partId: context.parts.piece.id });
    expect(history.items.filter((row) => row.movementType === 'checkout')).toEqual([]);
  });
});
