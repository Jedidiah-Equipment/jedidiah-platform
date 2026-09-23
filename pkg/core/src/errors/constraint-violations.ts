import { getForeignKeyViolationConstraint, getUniqueViolationConstraint, isUniqueViolation } from '@pkg/db';

/**
 * How a feature reads the database's verdict: a unique violation names a duplicate, a foreign-key
 * violation (a trigger raising SQLSTATE 23503 included) names a missing or ineligible reference. Each
 * feature supplies the error it wants for either, keyed by the constraint where one row means
 * different things; a translation that returns nothing, and anything else, propagates untouched.
 */
export type ConstraintTranslation = {
  unique: (constraint: string | null) => Error | undefined;
  foreignKey: (constraint: string) => Error | undefined;
};

export async function translatingConstraintViolations<T>(
  translation: ConstraintTranslation,
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isUniqueViolation(error)) throw translation.unique(getUniqueViolationConstraint(error)) ?? error;
    const constraint = getForeignKeyViolationConstraint(error);
    if (constraint) throw translation.foreignKey(constraint) ?? error;
    throw error;
  }
}
