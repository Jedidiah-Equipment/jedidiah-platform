import type { CategoryKind } from '@pkg/schema/contracting';
import { translatingConstraintViolations } from '../../errors/constraint-violations.js';

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
export const invalidCategory = (kind: CategoryKind) =>
  new FleetError('fleet.invalid_category', `Select ${kind === 'machine' ? 'a Machine' : 'an Implement'} category.`);
export const kindInUse = () =>
  new FleetError('fleet.kind_in_use', 'Move the Machines or Implements out of this category before changing its kind.');
export const notFound = (noun: string) => new FleetError('fleet.not_found', `${noun} not found.`);
// The kind triggers of migration 0147 raise as foreign-key violations named after the referencing table.
const foreignKeyErrors: Record<string, () => FleetError> = {
  machine_category_kind: () => invalidCategory('machine'),
  implement_category_kind: () => invalidCategory('implement'),
  category_kind_in_use: kindInUse,
};
export const withFleetConstraints = <T>(action: () => Promise<T>) =>
  translatingConstraintViolations(
    {
      unique: () => new FleetError('fleet.duplicate', 'That code or category name already exists.'),
      foreignKey: (constraint) =>
        foreignKeyErrors[constraint]?.() ??
        new FleetError('fleet.invalid_reference', 'The selected record no longer exists.'),
    },
    action,
  );
export function assertNotRetired(row: { retiredAt: Date | null }) {
  if (row.retiredAt)
    throw new FleetError('fleet.retired', 'This fleet entry is retired and cannot be changed or deleted.');
}
