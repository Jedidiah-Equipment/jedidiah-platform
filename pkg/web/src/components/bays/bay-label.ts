import type { Bay } from '@pkg/schema';

// Operator name when a bay has a current operator, else null.
export function bayOperatorName(bay: Pick<Bay, 'currentOperator'>): string | null {
  return bay.currentOperator?.name ?? null;
}

/** Card/select label that adds the current Operator without duplicating a legacy embedded suffix. */
export function bayNameWithOperator(bay: Pick<Bay, 'currentOperator' | 'name'>): string {
  return withOperatorSuffix(bay.name, bayOperatorName(bay));
}

/**
 * The planner's Bay row: the Bay plus the first name the floor calls its Operator by. First name
 * only because the row is narrow and the shop has one Ayanda per Bay, not one Ayanda Ndlovu.
 */
export function bayNameWithOperatorFirstName(bay: Pick<Bay, 'currentOperator' | 'name'>): string {
  const operator = bayOperatorName(bay);

  return withOperatorSuffix(bay.name, operator === null ? null : firstNameOf(operator));
}

/**
 * Bay names predate the Operator record and many already end in one, so a second copy is skipped.
 * The match reads the name's last dash-separated segment rather than the exact ` - Name` string:
 * those legacy names were hand-typed, and "Repairs- Mjabulisi" is as much a name already carrying
 * its Operator as "Fabrication Bay 1 - Ayanda" is.
 */
function withOperatorSuffix(name: string, operator: string | null): string {
  if (!operator) return name;

  const lastSegment = name.slice(name.lastIndexOf('-') + 1).trim();

  return lastSegment.toLowerCase() === operator.toLowerCase() ? name : `${name} - ${operator}`;
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
