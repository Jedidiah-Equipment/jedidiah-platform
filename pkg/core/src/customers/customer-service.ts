import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  customers,
  type Db,
  getPaginationQueryOptions,
  getSortOrder,
} from '@pkg/db';
import type {
  AuthId,
  CustomerCreateInput,
  CustomerListInput,
  CustomerListResult,
  CustomerPatchInput,
  CustomerUpdateInput,
  UUID,
} from '@pkg/schema';
import { Customer } from '@pkg/schema';
import { and, asc, eq, type SQL, sql } from 'drizzle-orm';

import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditUpdate,
} from '../audit/audit-service.js';
import { CustomerNotFoundError } from './customer-errors.js';

type CustomerRow = typeof customers.$inferSelect;

export const customerAuditDescriptor = defineAuditDescriptor<CustomerRow>({
  entityType: 'customer',
  noun: 'customer',
  primaryLabelField: 'companyName',
  entityId: (row) => row.id,
  toRecord: (row) => ({
    address: row.address,
    companyName: row.companyName,
    contactPerson: row.contactPerson,
    email: row.email,
    notes: row.notes,
    phone: row.phone,
    thumbnailDataUrl: row.thumbnailDataUrl,
    vatNumber: row.vatNumber,
  }),
});

export function mapCustomer(row: CustomerRow): Customer {
  return Customer.parse({
    address: row.address,
    companyName: row.companyName,
    contactPerson: row.contactPerson,
    createdAt: row.createdAt.toISOString(),
    email: row.email,
    id: row.id,
    notes: row.notes,
    phone: row.phone,
    thumbnailDataUrl: row.thumbnailDataUrl,
    updatedAt: row.updatedAt.toISOString(),
    vatNumber: row.vatNumber,
  });
}

export async function listCustomers({ db, input }: { db: Db; input: CustomerListInput }): Promise<CustomerListResult> {
  const sortColumn = getCustomerSortColumn(input.sortBy);
  const orderBy = getSortOrder(sortColumn, input.sortDirection);
  const where = buildCustomerListWhere(input);
  const rows = await db.query.customers.findMany({
    where,
    orderBy: [orderBy, asc(customers.id)],
    ...getPaginationQueryOptions(input),
  });
  const total = await db.$count(customers, where);

  return {
    items: rows.map(mapCustomer),
    total,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
  };
}

function buildCustomerListWhere(input: CustomerListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.search) {
    const globalSearchWhere = createGlobalSearchCondition(input.search, [
      sql`${customers.companyName}`,
      sql`${customers.email}`,
      sql`${customers.id}::text`,
      sql`${customers.vatNumber}`,
    ]);

    if (globalSearchWhere) {
      conditions.push(globalSearchWhere);
    }
  }

  if (input.columnFilters.companyName) {
    conditions.push(
      createEscapedContainsSearchCondition(sql`${customers.companyName}`, input.columnFilters.companyName),
    );
  }

  if (input.columnFilters.email) {
    conditions.push(createEscapedContainsSearchCondition(sql`${customers.email}`, input.columnFilters.email));
  }

  if (input.columnFilters.id) {
    conditions.push(createEscapedContainsSearchCondition(sql`${customers.id}::text`, input.columnFilters.id));
  }

  if (input.columnFilters.vatNumber) {
    conditions.push(createEscapedContainsSearchCondition(sql`${customers.vatNumber}`, input.columnFilters.vatNumber));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function getCustomer({ db, id }: { db: Db; id: UUID }): Promise<Customer> {
  const row = await db.query.customers.findFirst({
    where: eq(customers.id, id),
  });

  if (!row) {
    throw new CustomerNotFoundError(id);
  }

  return mapCustomer(row);
}

export async function createCustomer({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: CustomerCreateInput;
}): Promise<Customer> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(customers).values(input).returning();

    if (!row) {
      throw new Error('Customer insert did not return a row');
    }

    await recordAuditCreate({ db: tx, descriptor: customerAuditDescriptor, actorUserId, input: row });

    return mapCustomer(row);
  });
}

export async function updateCustomer({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: CustomerUpdateInput;
}): Promise<Customer> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(customers).where(eq(customers.id, input.id)).for('update');

    if (!before) {
      throw new CustomerNotFoundError(input.id);
    }

    const patch = {
      address: input.address,
      companyName: input.companyName,
      contactPerson: input.contactPerson,
      email: input.email,
      notes: input.notes,
      phone: input.phone,
      thumbnailDataUrl: input.thumbnailDataUrl,
      vatNumber: input.vatNumber,
    };
    const after = { ...before, ...patch };
    const changes = diffAuditUpdate(customerAuditDescriptor, before, after);

    if (!changes) {
      return mapCustomer(before);
    }

    const [row] = await tx
      .update(customers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(customers.id, input.id))
      .returning();

    if (!row) {
      throw new CustomerNotFoundError(input.id);
    }

    await recordAuditUpdate({ db: tx, descriptor: customerAuditDescriptor, actorUserId, after: row, changes });

    return mapCustomer(row);
  });
}

/**
 * Applies only the fields present in `input` over the current row, all under the same row lock as the
 * write. Fields left `undefined` are read from the locked row, so a concurrent edit to an omitted
 * field can never be reverted. Used by the assistant's partial Customer update tool.
 */
export async function patchCustomer({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: CustomerPatchInput;
}): Promise<Customer> {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(customers).where(eq(customers.id, input.id)).for('update');

    if (!before) {
      throw new CustomerNotFoundError(input.id);
    }

    // `undefined` keeps the current value; an explicit `null` clears a nullable field.
    const patch = {
      address: input.address !== undefined ? input.address : before.address,
      companyName: input.companyName ?? before.companyName,
      contactPerson: input.contactPerson !== undefined ? input.contactPerson : before.contactPerson,
      email: input.email !== undefined ? input.email : before.email,
      notes: input.notes !== undefined ? input.notes : before.notes,
      phone: input.phone !== undefined ? input.phone : before.phone,
      vatNumber: input.vatNumber !== undefined ? input.vatNumber : before.vatNumber,
    };
    const after = { ...before, ...patch };
    const changes = diffAuditUpdate(customerAuditDescriptor, before, after);

    if (!changes) {
      return mapCustomer(before);
    }

    const [row] = await tx
      .update(customers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(customers.id, input.id))
      .returning();

    if (!row) {
      throw new CustomerNotFoundError(input.id);
    }

    await recordAuditUpdate({ db: tx, descriptor: customerAuditDescriptor, actorUserId, after: row, changes });

    return mapCustomer(row);
  });
}

function getCustomerSortColumn(sortBy: CustomerListInput['sortBy']) {
  if (sortBy === 'createdAt') {
    return customers.createdAt;
  }

  if (sortBy === 'email') {
    return customers.email;
  }

  if (sortBy === 'id') {
    return customers.id;
  }

  return customers.companyName;
}
