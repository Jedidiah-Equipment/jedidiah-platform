import type { UUID } from '@pkg/schema';

/** A credit note answers this order's own returns; anything else is a reference to nothing. */
export class CreditNoteReturnNotFoundError extends Error {
  readonly code = 'credit_note.return_not_found' as const;

  constructor(readonly stockMovementId: UUID) {
    super('One of the selected returns is not a return on this Purchase Order.');
  }
}

/**
 * The supplier credits the original invoice one-to-one (spec §4), so a return takes at most one
 * credit note. Two notes claiming the same return would double-count the money owed.
 */
export class CreditNoteAlreadySettledError extends Error {
  readonly code = 'credit_note.already_settled' as const;

  constructor(readonly stockMovementId: UUID) {
    super('One of the selected returns has already been settled by a credit note.');
  }
}

export type CreditNoteCoreError = CreditNoteAlreadySettledError | CreditNoteReturnNotFoundError;

export function isCreditNoteCoreError(error: unknown): error is CreditNoteCoreError {
  return error instanceof CreditNoteAlreadySettledError || error instanceof CreditNoteReturnNotFoundError;
}
