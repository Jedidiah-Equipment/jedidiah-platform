import { createGlobalSearchCondition, type Db, user, withPagination } from '@pkg/db';
import { getNextCursor } from '@pkg/schema';
import type {
  InventoryOperatorOptionListInput,
  InventoryOperatorOptionListResult,
  InventoryRecipientOptionListInput,
  InventoryRecipientOptionListResult,
} from '@pkg/schema/equipment';
import {
  CONTRACTING_RECIPIENT_ROLES,
  InventoryOperatorOptionListResult as InventoryOperatorOptionListResultSchema,
  InventoryRecipientOptionListResult as InventoryRecipientOptionListResultSchema,
} from '@pkg/schema/equipment';
import { and, asc, inArray, isNotNull, or, type SQL, sql } from 'drizzle-orm';
import { activePersonCondition } from '../../users/active-person.js';

/**
 * The Operator rule: who may be named as the Operator of a Stock Movement — any active Equipment
 * person. Never a disabled account or a device, for the reason `resolveMovementActor` refuses them as
 * an Operator: the ledger keeps the name forever, and a name that cannot answer for the stock should
 * not be offered. The web Operator field, Purchase Order Received by and the tablet's Quick-switch
 * share it; a Checkout's Received by offers a superset (`eligibleRecipientCondition`).
 */
export function eligibleMovementPersonCondition(): SQL {
  return and(isNotNull(user.role), activePersonCondition()) as SQL;
}

/**
 * Who may receive a Checkout Without a Job: everyone the Operator rule allows, plus Contracting
 * Drivers and Mechanics, to whom stores issue parts without giving them an Equipment role. One
 * predicate serves Received by and the Recipient check on the post, so nothing the picker offers is
 * refused on write.
 */
export function eligibleRecipientCondition(): SQL {
  return and(
    activePersonCondition(),
    or(isNotNull(user.role), inArray(user.contractingRole, CONTRACTING_RECIPIENT_ROLES)),
  ) as SQL;
}

export async function listMovementOperators({
  db,
  input,
}: {
  db: Db;
  input: InventoryOperatorOptionListInput;
}): Promise<InventoryOperatorOptionListResult> {
  const { rows, ...page } = await pagePeople(db, input, eligibleMovementPersonCondition());
  return InventoryOperatorOptionListResultSchema.parse({
    ...page,
    items: rows.map(({ id, name, thumbnailDataUrl }) => ({ id, name, thumbnailDataUrl })),
  });
}

export async function listInventoryRecipients({
  db,
  input,
}: {
  db: Db;
  input: InventoryRecipientOptionListInput;
}): Promise<InventoryRecipientOptionListResult> {
  const { rows, ...page } = await pagePeople(db, input, eligibleRecipientCondition());
  return InventoryRecipientOptionListResultSchema.parse({
    ...page,
    items: rows.map(({ contractingRole, equipmentRole, ...person }) => ({
      ...person,
      contractingRole: equipmentRole === null ? contractingRole : null,
    })),
  });
}

/** One page of the people a rule allows, searched by name. */
async function pagePeople(db: Db, input: InventoryOperatorOptionListInput, rule: SQL) {
  const where = and(rule, createGlobalSearchCondition(input.search, [sql`${user.name}`]));
  const page = db
    .select({
      contractingRole: user.contractingRole,
      equipmentRole: user.role,
      id: user.id,
      name: user.name,
      thumbnailDataUrl: user.image,
    })
    .from(user)
    .where(where)
    .orderBy(asc(user.name), asc(user.id))
    .$dynamic();
  const [rows, total] = await Promise.all([withPagination(page, input), db.$count(user, where)]);
  return { nextCursor: getNextCursor({ count: rows.length, cursor: input.cursor, total }), rows, total };
}
