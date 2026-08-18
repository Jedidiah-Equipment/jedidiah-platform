import { getFirstName } from '@pkg/domain';
import type { Bay } from '@pkg/schema';

// Operator name when a bay has a current operator, else null.
export function bayOperatorName(bay: Pick<Bay, 'currentOperator'>): string | null {
  return bay.currentOperator?.name ?? null;
}

/** Card/select label naming the Bay and its current Operator. */
export function bayNameWithOperator(bay: Pick<Bay, 'currentOperator' | 'name'>): string {
  return withOperatorSuffix(bay.name, bayOperatorName(bay));
}

/**
 * The planner's Bay row: the Bay plus the first name the floor calls its Operator by. First name
 * only because the row is narrow and the shop has one Ayanda per Bay, not one Ayanda Ndlovu.
 */
export function bayNameWithOperatorFirstName(bay: Pick<Bay, 'currentOperator' | 'name'>): string {
  const operator = bayOperatorName(bay);

  return withOperatorSuffix(bay.name, operator === null ? null : getFirstName(operator));
}

/** The Bay's own name is the whole label while no Operator is assigned. */
function withOperatorSuffix(name: string, operator: string | null): string {
  return operator === null ? name : `${name} - ${operator}`;
}
