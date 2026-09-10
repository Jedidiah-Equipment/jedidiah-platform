import { getForeignKeyViolationConstraint, isUniqueViolation } from '@pkg/db';
import type { CategoryKind } from '@pkg/schema/contracting';

export type FleetErrorCode =
  | 'fleet.not_found'
  | 'fleet.duplicate'
  | 'fleet.in_use'
  | 'fleet.retired'
  | 'fleet.driver_assigned'
  | 'fleet.invalid_driver'
  | 'fleet.invalid_category'
  | 'fleet.kind_in_use'
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
    const constraint = getForeignKeyViolationConstraint(error);
    if (constraint === 'machine_category_kind') throw invalidCategory('machine');
    if (constraint === 'implement_category_kind') throw invalidCategory('implement');
    if (constraint === 'category_kind_in_use') throw kindInUse();
    if (constraint) throw new FleetError('fleet.invalid_reference', 'The selected record no longer exists.');
    throw error;
  }
}
export function assertNotRetired(row: { retiredAt: Date | null }) {
  if (row.retiredAt)
    throw new FleetError('fleet.retired', 'This fleet entry is retired and cannot be changed or deleted.');
}
export const invalidCategory = (kind: CategoryKind) =>
  new FleetError('fleet.invalid_category', `Select ${kind === 'machine' ? 'a Machine' : 'an Implement'} category.`);
export const kindInUse = () =>
  new FleetError('fleet.kind_in_use', 'Move the Machines or Implements out of this category before changing its kind.');
