import {
  createEscapedContainsSearchCondition,
  createGlobalSearchCondition,
  createPagedListResult,
  customers,
  type Db,
  getPaginationQueryOptions,
  getSortOrder,
} from '@pkg/db';
import type {
  AuthId,
  Customer,
  CustomerCreateInput,
  CustomerListInput,
  CustomerListResult,
  CustomerUpdateInput,
  UUID,
} from '@pkg/schema';
import { and, asc, eq, type SQL, sql } from 'drizzle-orm';

import { createAuditChanges, customerAuditDescriptor, insertAuditEvent } from '../audit/audit-service.js';
import { CustomerNotFoundError } from './customer-errors.js';

type CustomerRow = typeof customers.$inferSelect;

export function mapCustomer(row: CustomerRow): Customer {
  return {
    address: row.address,
    companyName: row.companyName,
    contactPerson: row.contactPerson,
    createdAt: row.createdAt.toISOString(),
    email: row.email,
    id: row.id,
    notes: row.notes,
    phone: row.phone,
    updatedAt: row.updatedAt.toISOString(),
  };
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

  return createPagedListResult({
    items: rows.map(mapCustomer),
    total,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
  });
}

function buildCustomerListWhere(input: CustomerListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.search) {
    const globalSearchWhere = createGlobalSearchCondition(input.search, [
      sql`${customers.companyName}`,
      sql`${customers.email}`,
      sql`${customers.id}::text`,
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

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'created',
        actorUserId,
        after: row,
        before: null,
        changes: null,
        entityId: row.id,
        entityType: customerAuditDescriptor.entityType,
      },
    });

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

    const after = {
      ...before,
      address: input.address,
      companyName: input.companyName,
      contactPerson: input.contactPerson,
      email: input.email,
      notes: input.notes,
      phone: input.phone,
    };
    const changes = createAuditChanges(before, after, customerAuditDescriptor.fields);

    if (!changes) {
      return mapCustomer(before);
    }

    const [row] = await tx
      .update(customers)
      .set({
        address: input.address,
        companyName: input.companyName,
        contactPerson: input.contactPerson,
        email: input.email,
        notes: input.notes,
        phone: input.phone,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, input.id))
      .returning();

    if (!row) {
      throw new CustomerNotFoundError(input.id);
    }

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'updated',
        actorUserId,
        after: row,
        before,
        changes,
        entityId: row.id,
        entityType: customerAuditDescriptor.entityType,
      },
    });

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
