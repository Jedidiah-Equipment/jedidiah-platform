import { describe, expect, it } from 'vitest';

import {
  canPostStoresMovement,
  switchStoresMovementTarget,
  syncDefaultRecipient,
  toStoresMovementInput,
} from './job-movement-model';

const PART_ID = '00000000-0000-4000-8000-000000000001';
const JOB_ID = '00000000-0000-4000-8000-000000000002';
const SOURCE_ID = '00000000-0000-4000-8000-000000000003';
const actor = { id: 'operator', name: 'Operator', thumbnailDataUrl: null };

describe('stores movement targets', () => {
  it('clears hidden state and defaults the Checkout recipient to the current operator', () => {
    const state = {
      job: { code: 'JOB-1', id: JOB_ID } as never,
      jobSearch: 'JOB',
      purpose: '',
      recipient: null,
      sourceCheckout: null,
    };

    expect(
      switchStoresMovementTarget({ actor, currentMode: 'job', isCheckout: true, state, targetMode: 'person' }),
    ).toMatchObject({
      job: null,
      jobSearch: '',
      recipient: actor,
      sourceCheckout: null,
    });
    expect(
      switchStoresMovementTarget({
        actor,
        currentMode: 'person',
        isCheckout: true,
        state: { ...state, purpose: 'repair', recipient: actor },
        targetMode: 'job',
      }),
    ).toMatchObject({ purpose: '', recipient: null, sourceCheckout: null });

    expect(
      switchStoresMovementTarget({ actor, currentMode: 'person', isCheckout: false, state, targetMode: 'person' }),
    ).toBe(state);
  });

  it('posts a different recipient and an exact linked source as separate strict payloads', () => {
    expect(
      toStoresMovementInput({
        actorUserId: actor.id,
        isCheckout: true,
        jobId: null,
        lengthMm: null,
        mode: 'person',
        partId: PART_ID,
        purpose: 'Repair drill',
        quantity: 2,
        recipientUserId: 'recipient',
        sourceCheckoutId: null,
      }),
    ).toEqual({
      actorUserId: actor.id,
      lengthMm: null,
      note: 'Repair drill',
      partId: PART_ID,
      quantity: 2,
      recipientUserId: 'recipient',
    });
    expect(
      toStoresMovementInput({
        actorUserId: actor.id,
        isCheckout: false,
        jobId: null,
        lengthMm: null,
        mode: 'person',
        partId: PART_ID,
        purpose: '',
        quantity: 0.5,
        recipientUserId: null,
        sourceCheckoutId: SOURCE_ID,
      }),
    ).toEqual({ actorUserId: actor.id, quantity: 0.5, sourceCheckoutId: SOURCE_ID });
  });

  it('follows a changed operator only while the recipient is still the operator default', () => {
    const nextActor = { ...actor, id: 'next-operator', name: 'Next Operator' };
    const chosenRecipient = { ...actor, id: 'chosen-recipient', name: 'Chosen Recipient' };

    expect(syncDefaultRecipient({ actor: null, previousActorUserId: actor.id, recipient: actor })).toBeNull();
    expect(syncDefaultRecipient({ actor: nextActor, previousActorUserId: null, recipient: null })).toBe(nextActor);
    expect(syncDefaultRecipient({ actor: nextActor, previousActorUserId: actor.id, recipient: chosenRecipient })).toBe(
      chosenRecipient,
    );
  });

  it('keeps posting gated until the tablet has an operator as well as valid movement facts', () => {
    const ready = { hasLength: true, hasTarget: true, quantity: 1 };
    expect(canPostStoresMovement({ ...ready, actorUserId: null })).toBe(false);
    expect(canPostStoresMovement({ ...ready, actorUserId: actor.id })).toBe(true);
  });
});
