import type { CustomerPossibleMatch } from '@pkg/schema/equipment';

export class CustomerNotFoundError extends Error {
  readonly code = 'customer.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Customer not found: ${id}`);
    this.name = 'CustomerNotFoundError';
    this.metadata = { id };
  }
}

export class CustomerInUseError extends Error {
  readonly code = 'customer.in_use';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Customer is referenced by another record: ${id}`);
    this.name = 'CustomerInUseError';
    this.metadata = { id };
  }
}

export class CustomerMergeSelfError extends Error {
  readonly code = 'customer.merge_self';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Customer cannot be merged into itself: ${id}`);
    this.name = 'CustomerMergeSelfError';
    this.metadata = { id };
  }
}

export class CustomerMergeBusyError extends Error {
  readonly code = 'customer.merge_busy';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Customer merge is waiting for another change: ${id}`);
    this.name = 'CustomerMergeBusyError';
    this.metadata = { id };
  }
}

export class CustomerPossibleMatchError extends Error {
  readonly code = 'customer.possible_match';
  readonly metadata: { matches: CustomerPossibleMatch[] };
  constructor(matches: CustomerPossibleMatch[]) {
    super('A Customer with this name already exists. Use a possible match or explicitly choose to create anyway.');
    this.name = 'CustomerPossibleMatchError';
    this.metadata = { matches };
  }
}

export type CustomerCoreError =
  | CustomerPossibleMatchError
  | CustomerInUseError
  | CustomerNotFoundError
  | CustomerMergeSelfError
  | CustomerMergeBusyError;

export function isCustomerCoreError(error: unknown): error is CustomerCoreError {
  return (
    error instanceof CustomerPossibleMatchError ||
    error instanceof CustomerInUseError ||
    error instanceof CustomerNotFoundError ||
    error instanceof CustomerMergeSelfError ||
    error instanceof CustomerMergeBusyError
  );
}
