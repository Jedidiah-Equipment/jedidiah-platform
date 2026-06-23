import type { Bay } from '@pkg/schema';

// Operator name when a bay has a current operator, else null.
export function bayOperatorName(bay: Pick<Bay, 'currentOperator'>): string | null {
  return bay.currentOperator?.name ?? null;
}
