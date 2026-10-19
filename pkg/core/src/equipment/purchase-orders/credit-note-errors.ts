export type CreditNoteErrorCode = 'credit_note.already_settled' | 'credit_note.return_not_found';

export class CreditNoteError extends Error {
  constructor(
    readonly code: CreditNoteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CreditNoteError';
  }
}

export const isCreditNoteError = (error: unknown): error is CreditNoteError => error instanceof CreditNoteError;

/** A credit note answers this order's own returns; anything else is a reference to nothing. */
export const creditNoteReturnNotFound = () =>
  new CreditNoteError(
    'credit_note.return_not_found',
    'One of the selected returns is not a return on this Purchase Order.',
  );

/**
 * The supplier credits the original invoice one-to-one (spec §4), so a return takes at most one
 * credit note. Two notes claiming the same return would double-count the money owed.
 */
export const creditNoteAlreadySettled = () =>
  new CreditNoteError(
    'credit_note.already_settled',
    'One of the selected returns has already been settled by a credit note.',
  );
