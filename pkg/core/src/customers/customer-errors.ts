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

export type CustomerCoreError = CustomerInUseError | CustomerNotFoundError;

export function isCustomerCoreError(error: unknown): error is CustomerCoreError {
  return error instanceof CustomerInUseError || error instanceof CustomerNotFoundError;
}
