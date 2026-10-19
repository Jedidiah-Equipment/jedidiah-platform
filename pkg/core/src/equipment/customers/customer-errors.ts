import type { CustomerPossibleMatch } from '@pkg/schema/equipment';

export type CustomerErrorCode =
  | 'customer.in_use'
  | 'customer.merge_busy'
  | 'customer.merge_self'
  | 'customer.not_found'
  | 'customer.possible_match';

export class CustomerError extends Error {
  constructor(
    readonly code: CustomerErrorCode,
    message: string,
    /** The candidates a `possible_match` offers instead of creating a duplicate. */
    readonly matches?: CustomerPossibleMatch[],
  ) {
    super(message);
    this.name = 'CustomerError';
  }
}

export const isCustomerError = (error: unknown): error is CustomerError => error instanceof CustomerError;
export const customerNotFound = (id: string) => new CustomerError('customer.not_found', `Customer not found: ${id}`);
export const customerInUse = (id: string) =>
  new CustomerError('customer.in_use', `Customer is referenced by another record: ${id}`);
export const customerMergeSelf = (id: string) =>
  new CustomerError('customer.merge_self', `Customer cannot be merged into itself: ${id}`);
export const customerMergeBusy = (id: string) =>
  new CustomerError('customer.merge_busy', `Customer merge is waiting for another change: ${id}`);
export const customerPossibleMatch = (matches: CustomerPossibleMatch[]) =>
  new CustomerError(
    'customer.possible_match',
    'A Customer with this name already exists. Use a possible match or explicitly choose to create anyway.',
    matches,
  );
