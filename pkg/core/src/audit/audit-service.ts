import { auditEvents, type DatabaseTransaction, type Db, getSortOrder, user, withPagination } from '@pkg/db';
import type { AuditAction, AuditChanges, AuditEntityType, AuditListInput, AuditListResult } from '@pkg/schema';
import { AuditEvent, formatJobCode, formatQuoteCode, JobCode, QuoteCode } from '@pkg/schema';
import { and, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';

type AuditRecord = Record<string, unknown>;

type AuditEntityDescriptor = {
  entityType: AuditEntityType;
  noun: string;
  primaryLabelField: string;
  primaryLabelFormatter?: (value: unknown) => string;
  fields: Record<string, string>;
};

type CreateAuditSummaryInput = {
  action: AuditAction;
  changes: AuditChanges | null;
  entityType: AuditEntityType;
  before?: AuditRecord | null;
  after?: AuditRecord | null;
};

type InsertAuditEventInput = CreateAuditSummaryInput & {
  actorUserId: string | null;
  entityId: string;
};

export const productAuditDescriptor: AuditEntityDescriptor = {
  entityType: 'product',
  noun: 'product',
  primaryLabelField: 'name',
  fields: {
    assemblies: 'assemblies',
    basePrice: 'base price',
    currencyCode: 'currency',
    description: 'description',
    buildTimeDays: 'build time days',
    modelCode: 'model code',
    name: 'name',
    thumbnailDataUrl: 'thumbnail',
  },
};

export const partAuditDescriptor: AuditEntityDescriptor = {
  entityType: 'part',
  noun: 'part',
  primaryLabelField: 'name',
  fields: {
    category: 'category',
    code: 'code',
    description: 'description',
    drawingCode: 'drawing code',
    finish: 'finish',
    isInternallyFabricated: 'internally fabricated',
    name: 'name',
    supplierCode: 'supplier code',
    supplierId: 'supplier',
    unitOfMeasure: 'unit of measure',
  },
};

export const customerAuditDescriptor: AuditEntityDescriptor = {
  entityType: 'customer',
  noun: 'customer',
  primaryLabelField: 'companyName',
  fields: {
    address: 'address',
    companyName: 'company name',
    contactPerson: 'contact person',
    email: 'email',
    notes: 'notes',
    phone: 'phone',
    thumbnailDataUrl: 'thumbnail',
  },
};

export const userAuditDescriptor: AuditEntityDescriptor = {
  entityType: 'user',
  noun: 'user',
  primaryLabelField: 'email',
  fields: {
    department: 'department',
    member: 'department membership',
    thumbnailDataUrl: 'thumbnail',
  },
};

export const jobAuditDescriptor: AuditEntityDescriptor = {
  entityType: 'job',
  noun: 'job',
  primaryLabelField: 'code',
  primaryLabelFormatter: formatJobAuditLabel,
  fields: {
    productId: 'product',
    productSerialNumber: 'product serial number',
    quoteId: 'quote',
  },
};

function formatJobAuditLabel(value: unknown): string {
  if (typeof value === 'number') {
    return formatJobCode(value);
  }

  const result = JobCode.safeParse(value);

  return result.success ? result.data : String(value);
}

export const jobStageAuditDescriptor: AuditEntityDescriptor = {
  entityType: 'job_stage',
  noun: 'job stage',
  primaryLabelField: 'stage',
  fields: {},
};

export const quoteAuditDescriptor: AuditEntityDescriptor = {
  entityType: 'quote',
  noun: 'quote',
  primaryLabelField: 'code',
  primaryLabelFormatter: formatQuoteAuditLabel,
  // Quote update lock enforcement uses these fields to detect locked-field changes.
  fields: {
    customerId: 'customer',
    deliveryIncluded: 'delivery included',
    deliveryPrice: 'delivery price',
    discount: 'discount',
    notes: 'notes',
    paymentTerms: 'payment terms',
    plannedDeliveryDate: 'planned delivery date',
    preferredDeliveryDate: 'preferred delivery date',
    productId: 'product',
    quotedBasePrice: 'quoted base price',
    quotedCurrencyCode: 'quoted currency',
    salesPersonId: 'salesperson',
    selectedAssemblies: 'selected assemblies',
    status: 'status',
    validUntil: 'valid until',
  },
};

export const supplierAuditDescriptor: AuditEntityDescriptor = {
  entityType: 'supplier',
  noun: 'supplier',
  primaryLabelField: 'companyName',
  fields: {
    address: 'address',
    companyName: 'company name',
    contactPerson: 'contact person',
    email: 'email',
    notes: 'notes',
    phone: 'phone',
    thumbnailDataUrl: 'thumbnail',
  },
};

function formatQuoteAuditLabel(value: unknown): string {
  if (typeof value === 'number') {
    return formatQuoteCode(value);
  }

  const result = QuoteCode.safeParse(value);

  return result.success ? result.data : String(value);
}

const auditEntityDescriptors: Record<AuditEntityType, AuditEntityDescriptor> = {
  customer: customerAuditDescriptor,
  job: jobAuditDescriptor,
  job_stage: jobStageAuditDescriptor,
  part: partAuditDescriptor,
  product: productAuditDescriptor,
  quote: quoteAuditDescriptor,
  supplier: supplierAuditDescriptor,
  user: userAuditDescriptor,
};

type AuditEventRow = typeof auditEvents.$inferSelect & {
  actorName: string | null;
  actorEmail: string | null;
};

export function createAuditChanges<TRecord extends AuditRecord>(
  before: TRecord,
  after: TRecord,
  fields: Record<string, string>,
): AuditChanges | null {
  const changes: AuditChanges = {};

  for (const field of Object.keys(fields)) {
    const from = toAuditValue(before[field]);
    const to = toAuditValue(after[field]);

    if (!Object.is(from, to)) {
      changes[field] = { from, to };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

export function createAuditSummary(input: CreateAuditSummaryInput): string {
  const descriptor = getAuditEntityDescriptor(input.entityType);

  if (input.action === 'created') {
    return `Created ${descriptor.noun} ${quoteLabel(getEntityLabel(descriptor, input.after))}`;
  }

  if (input.action === 'deleted') {
    return `Deleted ${descriptor.noun} ${quoteLabel(getEntityLabel(descriptor, input.before))}`;
  }

  const primaryFieldChange = input.changes?.[descriptor.primaryLabelField];
  if (primaryFieldChange) {
    return `Renamed ${descriptor.noun} ${quoteLabel(formatEntityLabel(descriptor, primaryFieldChange.from))} to ${quoteLabel(formatEntityLabel(descriptor, primaryFieldChange.to))}`;
  }

  return `Updated ${descriptor.noun} ${quoteLabel(getEntityLabel(descriptor, input.after ?? input.before))}`;
}

export async function insertAuditEvent({
  db,
  input,
}: {
  db: DatabaseTransaction;
  input: InsertAuditEventInput;
}): Promise<void> {
  await db.insert(auditEvents).values({
    action: input.action,
    actorUserId: input.actorUserId,
    changes: input.changes,
    entityId: input.entityId,
    entityType: input.entityType,
    summary: createAuditSummary(input),
  });
}

export async function listAuditEvents({ db, input }: { db: Db; input: AuditListInput }): Promise<AuditListResult> {
  const where = buildAuditListWhere(input);
  const sortColumn = auditEvents.occurredAt;
  const orderBy = getSortOrder(sortColumn, input.sortDirection);
  const rowsQuery = withPagination(
    db
      .select({
        action: auditEvents.action,
        actorEmail: user.email,
        actorName: user.name,
        actorUserId: auditEvents.actorUserId,
        changes: auditEvents.changes,
        entityId: auditEvents.entityId,
        entityType: auditEvents.entityType,
        id: auditEvents.id,
        occurredAt: auditEvents.occurredAt,
        summary: auditEvents.summary,
      })
      .from(auditEvents)
      .leftJoin(user, eq(auditEvents.actorUserId, user.id))
      .where(where)
      .orderBy(orderBy)
      .$dynamic(),
    input,
  );

  const [rows, total] = await Promise.all([rowsQuery, db.$count(auditEvents, where)]);

  return {
    items: rows.map(mapAuditEvent),
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
    total,
  };
}

function buildAuditListWhere(input: AuditListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.filters.actorUserIds.length > 0) {
    conditions.push(inArray(auditEvents.actorUserId, input.filters.actorUserIds));
  }

  if (input.filters.entityIds.length > 0) {
    conditions.push(inArray(auditEvents.entityId, input.filters.entityIds));
  }

  if (input.filters.entityTypes.length > 0) {
    conditions.push(inArray(auditEvents.entityType, input.filters.entityTypes));
  }

  if (input.filters.occurredAtStart) {
    conditions.push(gte(auditEvents.occurredAt, new Date(input.filters.occurredAtStart)));
  }

  if (input.filters.occurredAtEnd) {
    conditions.push(lte(auditEvents.occurredAt, new Date(input.filters.occurredAtEnd)));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function mapAuditEvent(row: AuditEventRow): AuditEvent {
  return AuditEvent.parse({
    action: row.action as AuditAction,
    actorEmail: row.actorEmail,
    actorName: row.actorName,
    actorUserId: row.actorUserId,
    changes: row.changes as AuditChanges | null,
    entityId: row.entityId,
    entityType: row.entityType as AuditEntityType,
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    summary: row.summary,
  });
}

function getAuditEntityDescriptor(entityType: AuditEntityType): AuditEntityDescriptor {
  return auditEntityDescriptors[entityType];
}

function getEntityLabel(descriptor: AuditEntityDescriptor, record: AuditRecord | null | undefined): string {
  return formatEntityLabel(descriptor, record?.[descriptor.primaryLabelField] ?? 'Unknown');
}

function formatEntityLabel(descriptor: AuditEntityDescriptor, value: unknown): string {
  return descriptor.primaryLabelFormatter?.(value) ?? String(value);
}

function quoteLabel(value: string): string {
  return `"${value}"`;
}

function toAuditValue(value: unknown): unknown | null {
  return value === undefined ? null : value;
}
