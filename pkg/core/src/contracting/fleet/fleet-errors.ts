import { getForeignKeyViolationConstraint, isUniqueViolation } from '@pkg/db';

export type FleetErrorCode =
  | 'fleet.not_found'
  | 'fleet.duplicate'
  | 'fleet.in_use'
  | 'fleet.retired'
  | 'fleet.driver_assigned'
  | 'fleet.invalid_driver'
  | 'fleet.invalid_reference';
export class FleetError extends Error {
  constructor(
    readonly code: FleetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FleetError';
  }
}
export function isFleetError(error: unknown): error is FleetError {
  return error instanceof FleetError;
}
export async function withFleetConstraints<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isUniqueViolation(error)) throw new FleetError('fleet.duplicate', 'That code or category name already exists.');
    if (getForeignKeyViolationConstraint(error))
      throw new FleetError('fleet.invalid_reference', 'The selected record no longer exists.');
    throw error;
  }
}
export function assertNotRetired(row: { retiredAt: Date | null }) {
  if (row.retiredAt)
    throw new FleetError('fleet.retired', 'This fleet entry is retired and cannot be changed or deleted.');
}
