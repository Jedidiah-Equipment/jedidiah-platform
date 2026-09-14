import type {
  InventoryRecipientOption,
  JobPickerOption,
  PostCheckoutInput as PostCheckoutInputType,
  PostReturnToStoreInput as PostReturnToStoreInputType,
  QuickSwitchActor,
  SourceCheckoutOption,
} from '@pkg/schema/equipment';
import { PostCheckoutInput, PostReturnToStoreInput } from '@pkg/schema/equipment';

export type StoresMovementTargetState = {
  job: JobPickerOption | null;
  jobSearch: string;
  purpose: string;
  recipient: InventoryRecipientOption | null;
  sourceCheckout: SourceCheckoutOption | null;
};

/** Switching target never leaves a hidden Job/person selection waiting to leak into a later post. */
export function switchStoresMovementTarget({
  actor,
  currentMode,
  isCheckout,
  state,
  targetMode,
}: {
  actor: QuickSwitchActor | null;
  currentMode: 'job' | 'person';
  isCheckout: boolean;
  state: StoresMovementTargetState;
  targetMode: 'job' | 'person';
}): StoresMovementTargetState {
  if (targetMode === currentMode) return state;

  if (targetMode === 'job') {
    return { ...state, purpose: '', recipient: null, sourceCheckout: null };
  }

  return {
    ...state,
    job: null,
    jobSearch: '',
    recipient: isCheckout ? actor : null,
    sourceCheckout: null,
  };
}

export function canPostStoresMovement({
  actorUserId,
  hasLength,
  hasTarget,
  quantity,
}: {
  actorUserId: string | null;
  hasLength: boolean;
  hasTarget: boolean;
  quantity: number | null;
}): boolean {
  return actorUserId !== null && quantity !== null && hasLength && hasTarget;
}

/** Builds exactly one strict API target arm from the state the tablet shows. */
type StoresMovementInputFacts = {
  actorUserId: string;
  jobId: string | null;
  lengthMm: number | null;
  mode: 'job' | 'person';
  partId: string;
  purpose: string;
  quantity: number;
  recipientUserId: string | null;
  sourceCheckoutId: string | null;
};

export function toStoresMovementInput(facts: StoresMovementInputFacts & { isCheckout: true }): PostCheckoutInputType;
export function toStoresMovementInput(
  facts: StoresMovementInputFacts & { isCheckout: false },
): PostReturnToStoreInputType;
export function toStoresMovementInput({
  actorUserId,
  isCheckout,
  jobId,
  lengthMm,
  mode,
  partId,
  purpose,
  quantity,
  recipientUserId,
  sourceCheckoutId,
}: StoresMovementInputFacts & {
  isCheckout: boolean;
}): PostCheckoutInputType | PostReturnToStoreInputType {
  if (mode === 'person') {
    return isCheckout
      ? PostCheckoutInput.parse({ actorUserId, lengthMm, note: purpose, partId, quantity, recipientUserId })
      : PostReturnToStoreInput.parse({ actorUserId, quantity, sourceCheckoutId });
  }

  const jobInput = { actorUserId, jobId, lengthMm, partId, quantity };
  return isCheckout ? PostCheckoutInput.parse(jobInput) : PostReturnToStoreInput.parse(jobInput);
}
