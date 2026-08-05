import type { Bay } from '@pkg/schema';

// Operator name when a bay has a current operator, else null.
export function bayOperatorName(bay: Pick<Bay, 'currentOperator'>): string | null {
  return bay.currentOperator?.name ?? null;
}

/** Card/select label that adds the current Operator without duplicating a legacy embedded suffix. */
export function bayNameWithOperator(bay: Pick<Bay, 'currentOperator' | 'name'>): string {
  const operator = bayOperatorName(bay);
  if (!operator) return bay.name;

  const suffix = ` - ${operator}`;
  return bay.name.endsWith(suffix) ? bay.name : `${bay.name}${suffix}`;
}
