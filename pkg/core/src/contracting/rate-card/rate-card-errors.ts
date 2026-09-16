import { translatingConstraintViolations } from '../../errors/constraint-violations.js';

export type RateCardErrorCode =
  | 'rate_card.not_found'
  | 'rate_card.duplicate'
  | 'rate_card.in_use'
  | 'rate_card.invalid_reference'
  | 'rate_card.reorder_mismatch';

export class RateCardError extends Error {
  constructor(
    readonly code: RateCardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RateCardError';
  }
}

export const isRateCardError = (error: unknown): error is RateCardError => error instanceof RateCardError;
export const rateCardNotFound = (noun: string) => new RateCardError('rate_card.not_found', `${noun} not found.`);
export const withRateCardConstraints = <T>(duplicateMessage: string, action: () => Promise<T>) =>
  translatingConstraintViolations(
    {
      unique: () => new RateCardError('rate_card.duplicate', duplicateMessage),
      foreignKey: () => new RateCardError('rate_card.invalid_reference', 'The selected record no longer exists.'),
    },
    action,
  );
