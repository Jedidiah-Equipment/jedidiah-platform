export class CustomerNotFoundError extends Error {
  readonly code = 'customer.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Customer not found: ${id}`);
    this.name = 'CustomerNotFoundError';
    this.metadata = { id };
  }
}

export type CustomerCoreError = CustomerNotFoundError;

export function isCustomerCoreError(error: unknown): error is CustomerCoreError {
  return error instanceof CustomerNotFoundError;
}
