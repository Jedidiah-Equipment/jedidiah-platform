import type { ChatToolResultSizeInfo } from '@pkg/schema';

import { type AiLink, createAiLink } from '../link-metadata.js';

type LinkableRecord = Record<string, unknown> & {
  id: string;
};

export const AI_TOOL_RESULT_MAX_SERIALIZED_BYTES = 24 * 1024;

export type AiToolResultSizeInfo = ChatToolResultSizeInfo;

export type ProjectedAiToolResult = {
  result: unknown;
  size: AiToolResultSizeInfo;
};

const ARRAY_TRUNCATION_MARKER_KEY = '__aiToolResultTruncatedItems';
const RESULT_TRUNCATION_MARKER_KEY = '__aiToolResultTruncated';

export function identityProjection(result: unknown): unknown {
  return result;
}

export function projectPagedItems(result: unknown, projectItem: (item: unknown) => unknown): unknown {
  if (!isObjectRecord(result) || !Array.isArray(result.items)) {
    return result;
  }

  return {
    items: result.items.map(projectItem),
    ...(typeof result.total === 'number' ? { total: result.total } : {}),
  };
}

export function projectCustomerListItem(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const projectedValue = pickDefined(value, ['id', 'companyName', 'contactPerson', 'email', 'phone', 'vatNumber']);
  const label = typeof value.companyName === 'string' ? value.companyName : null;
  return addLinks({ id: value.id, ...projectedValue }, [label ? createAiLink('Customer', label, value.id) : null]);
}

export function projectCustomerDetail(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const projectedValue = pickDefined(value, [
    'id',
    'companyName',
    'email',
    'vatNumber',
    'address',
    'contactPerson',
    'phone',
    'notes',
  ]);
  const label = typeof value.companyName === 'string' ? value.companyName : null;
  return addLinks({ id: value.id, ...projectedValue }, [label ? createAiLink('Customer', label, value.id) : null]);
}

export function projectJobListItem(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const projectedValue = pickDefined(value, [
    'id',
    'code',
    'productId',
    'productSerialNumber',
    'quoteId',
    'vinNumber',
    'description',
    'customerCompanyName',
    'customerId',
    'productModelCode',
    'productName',
    'quoteCode',
    'quoteKind',
    'scheduleState',
    'workTitle',
  ]);
  const label = typeof value.code === 'string' ? value.code : null;
  return addLinks({ id: value.id, ...projectedValue }, [
    label ? createAiLink('Job', label, value.id) : null,
    createLink('Quote', value.quoteCode, value.quoteId),
    createLink('Customer', value.customerCompanyName, value.customerId),
  ]);
}

export function projectJobDetail(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const projectedValue = {
    ...pickDefined(value, [
      'id',
      'code',
      'productId',
      'productSerialNumber',
      'quoteId',
      'vinNumber',
      'description',
      'customerCompanyName',
      'customerId',
      'productModelCode',
      'productName',
      'quoteCode',
      'quoteKind',
      'scheduleState',
      'workTitle',
    ]),
    ...(Array.isArray(value.cfo) ? { cfo: value.cfo } : {}),
    ...(Array.isArray(value.documents) ? { documents: value.documents.map(projectJobDocument) } : {}),
    ...(Array.isArray(value.schedule) ? { schedule: slimJobScheduleDepartments(value.schedule, value.id) } : {}),
  };
  const label = typeof value.code === 'string' ? value.code : null;
  return addLinks({ id: value.id, ...projectedValue }, [
    label ? createAiLink('Job', label, value.id) : null,
    createLink('Quote', value.quoteCode, value.quoteId),
    createLink('Customer', value.customerCompanyName, value.customerId),
  ]);
}

export function projectProductListItem(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const projectedValue = projectProductBase(value);
  const label = typeof value.name === 'string' ? value.name : null;
  return addLinks({ id: value.id, ...projectedValue }, [label ? createAiLink('Product', label, value.id) : null]);
}

export function projectProductDetail(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const projectedValue = projectProductBase(value);
  const label = typeof value.name === 'string' ? value.name : null;
  return addLinks({ id: value.id, ...projectedValue }, [label ? createAiLink('Product', label, value.id) : null]);
}

export function projectQuoteListItem(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const projectedValue = {
    ...pickDefined(value, [
      'id',
      'code',
      'customerId',
      'salesPersonId',
      'status',
      'statusChangedAt',
      'discountPercent',
      'depositPercent',
      'deliveryIncluded',
      'deliveryPrice',
      'validUntil',
      'preferredDeliveryDate',
      'plannedDeliveryDate',
      'documentNotes',
      'quotedBasePrice',
      'quotedCurrencyCode',
      'createdAt',
      'kind',
      'productId',
      'workTitle',
      'customerCompanyName',
      'job',
      'salesPersonEmail',
      'salesPersonName',
    ]),
    ...(isObjectRecord(value.product) || value.product === null
      ? { product: projectQuoteProductSummary(value.product) }
      : {}),
  };
  return addQuoteLinks(value, { id: value.id, ...projectedValue });
}

export function projectQuoteDetail(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const projectedValue = {
    ...pickDefined(value, [
      'id',
      'code',
      'customerId',
      'salesPersonId',
      'status',
      'statusChangedAt',
      'discountPercent',
      'depositPercent',
      'deliveryIncluded',
      'deliveryPrice',
      'validUntil',
      'preferredDeliveryDate',
      'plannedDeliveryDate',
      'notes',
      'documentNotes',
      'quotedBasePrice',
      'quotedCurrencyCode',
      'createdAt',
      'kind',
      'productId',
      'workTitle',
      'customerCompanyName',
      'job',
      'salesPersonEmail',
      'salesPersonName',
      'customerAddress',
      'customerContactPerson',
      'customerEmail',
      'customerPhone',
      'customerVatNumber',
    ]),
    ...(isObjectRecord(value.product) || value.product === null
      ? { product: projectQuoteProductDetail(value.product) }
      : {}),
    ...(Array.isArray(value.lineItems) ? { lineItems: value.lineItems.map(projectQuoteLineItem) } : {}),
    ...(Array.isArray(value.selectedAssemblies)
      ? { selectedAssemblies: value.selectedAssemblies.map(projectQuoteSelectedAssembly) }
      : {}),
  };
  return addQuoteLinks(value, { id: value.id, ...projectedValue });
}

export const projectQuoteCreateResult = projectQuoteDetail;

function addQuoteLinks(value: LinkableRecord, projectedValue: LinkableRecord): unknown {
  const label = typeof value.code === 'string' ? value.code : null;
  const product = isObjectRecord(value.product) ? value.product : null;
  const productLabel = typeof product?.name === 'string' ? product.name : null;
  return addLinks(projectedValue, [
    label ? createAiLink('Quote', label, value.id) : null,
    createLink('Customer', value.customerCompanyName, value.customerId),
    createLink('Product', productLabel, value.productId),
    createJobLink(value.job),
  ]);
}

export function projectUserList(value: unknown): unknown {
  if (!isObjectRecord(value) || !Array.isArray(value.users)) {
    return value;
  }

  return {
    ...value,
    users: value.users.map(projectAdminUserSummary),
  };
}

export function projectQuoteSalespeople(value: unknown): unknown {
  if (!isObjectRecord(value) || !Array.isArray(value.users)) {
    return value;
  }

  return {
    users: value.users.map(projectQuoteSalespersonSummary),
  };
}

export function projectPart(value: unknown): unknown {
  if (!isObjectRecord(value)) {
    return value;
  }

  return {
    ...value,
    ...(isObjectRecord(value.supplier) ? { supplier: projectPartSupplier(value.supplier) } : {}),
  };
}

export function projectPartList(value: unknown): unknown {
  if (!isObjectRecord(value) || !Array.isArray(value.items)) {
    return value;
  }

  return {
    items: value.items.map(projectPart),
    ...(typeof value.total === 'number' ? { total: value.total } : {}),
  };
}

export function projectAuditEventList(value: unknown): unknown {
  if (!isObjectRecord(value) || !Array.isArray(value.items)) {
    return value;
  }

  return {
    items: value.items.map(projectAuditEvent),
    ...(typeof value.total === 'number' ? { total: value.total } : {}),
  };
}

export function prepareAiToolResultForModel(
  result: unknown,
  { maxSerializedBytes = AI_TOOL_RESULT_MAX_SERIALIZED_BYTES }: { maxSerializedBytes?: number } = {},
): ProjectedAiToolResult {
  const stripped = stripThumbnailDataUrls(result);
  const budgeted = enforceSerializedResultBudget(stripped.value, maxSerializedBytes);

  return {
    result: budgeted.value,
    size: {
      maxSerializedBytes,
      removedThumbnailFieldsByFallback: stripped.removed,
      serializedBytes: budgeted.serializedBytes,
      truncated: budgeted.truncated,
    },
  };
}

function addLinks<T extends LinkableRecord>(value: T, links: readonly (AiLink | null)[]): T & { links?: AiLink[] } {
  const availableLinks = links.filter((link): link is AiLink => link !== null);

  if (availableLinks.length === 0) {
    return value;
  }

  return {
    ...value,
    links: availableLinks,
  };
}

function createLink(entity: AiLink['entity'], label: unknown, id: unknown): AiLink | null {
  if (typeof label !== 'string' || typeof id !== 'string') {
    return null;
  }

  return createAiLink(entity, label, id);
}

function createJobLink(value: unknown): AiLink | null {
  if (!isObjectRecord(value) || typeof value.jobCode !== 'string' || typeof value.jobId !== 'string') {
    return null;
  }

  return createAiLink('Job', value.jobCode, value.jobId);
}

function isRecord(value: unknown): value is LinkableRecord {
  return isObjectRecord(value) && typeof value.id === 'string';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickDefined(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const entries = keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]] as const);

  return Object.fromEntries(entries);
}

function projectProductBase(value: Record<string, unknown>): Record<string, unknown> {
  return {
    ...pickDefined(value, [
      'name',
      'nameHighlight',
      'description',
      'modelCode',
      'range',
      'basePrice',
      'buildTimeDays',
      'currencyCode',
      'requiresVinNumber',
      'category',
      'keyFeatures',
      'technicalDetails',
    ]),
    ...(Array.isArray(value.assemblies) ? { assemblies: value.assemblies.map(projectProductAssembly) } : {}),
    ...(Array.isArray(value.productBays) ? { productBays: value.productBays.map(projectProductBay) } : {}),
  };
}

function projectProductAssembly(value: unknown): unknown {
  if (!isObjectRecord(value)) {
    return value;
  }

  return {
    ...pickDefined(value, ['id', 'kind', 'name', 'price', 'parts', 'overrideStandardAssemblyIds']),
  };
}

function projectProductBay(value: unknown): unknown {
  if (!isObjectRecord(value)) {
    return value;
  }

  return {
    ...pickDefined(value, ['defaultWorkingDays']),
    ...(isObjectRecord(value.bay) ? { bay: projectBaySummary(value.bay) } : {}),
  };
}

function projectBaySummary(value: Record<string, unknown>): Record<string, unknown> {
  return pickDefined(value, ['id', 'department', 'name']);
}

function slimJobScheduleDepartments(schedule: unknown[], jobId: string): unknown[] {
  return schedule.map((department) => {
    if (!isObjectRecord(department) || !Array.isArray(department.bays)) {
      return department;
    }

    return {
      ...pickDefined(department, ['department']),
      bays: department.bays
        .map((bay) => {
          if (!isObjectRecord(bay) || !Array.isArray(bay.slots)) {
            return bay;
          }

          const slots = bay.slots
            .filter((slot) => isObjectRecord(slot) && slot.kind === 'work' && slot.jobId === jobId)
            .map(projectJobScheduleSlot);

          return {
            ...projectBaySummary(bay),
            currentOperator: projectBayOperator(bay.currentOperator),
            slots,
          };
        })
        .filter((bay) => !isObjectRecord(bay) || !Array.isArray(bay.slots) || bay.slots.length > 0),
    };
  });
}

function projectBayOperator(value: unknown): unknown {
  if (!isObjectRecord(value)) {
    return value;
  }

  return pickDefined(value, ['id', 'name', 'email']);
}

function projectJobScheduleSlot(value: unknown): unknown {
  if (!isObjectRecord(value)) {
    return value;
  }

  return pickDefined(value, [
    'id',
    'kind',
    'durationDays',
    'startDate',
    'endDate',
    'state',
    'jobCode',
    'jobId',
    'jobUnfinished',
  ]);
}

function projectJobDocument(value: unknown): unknown {
  if (!isObjectRecord(value)) {
    return value;
  }

  return pickDefined(value, ['id', 'filename', 'metadata', 'sourceProductName', 'uploaderName', 'uploaderEmail']);
}

function projectQuoteProductSummary(value: unknown): unknown {
  if (value === null) {
    return null;
  }

  if (!isObjectRecord(value)) {
    return value;
  }

  return pickDefined(value, ['buildTimeDays', 'currencyCode', 'modelCode', 'name']);
}

function projectQuoteProductDetail(value: unknown): unknown {
  if (value === null) {
    return null;
  }

  if (!isObjectRecord(value)) {
    return value;
  }

  return {
    ...pickDefined(value, ['buildTimeDays', 'currencyCode', 'modelCode', 'name', 'description', 'requiresVinNumber']),
    ...(Array.isArray(value.assemblies) ? { assemblies: value.assemblies.map(projectProductAssembly) } : {}),
    ...(Array.isArray(value.bays) ? { bays: value.bays.map(projectProductBay) } : {}),
  };
}

function projectQuoteLineItem(value: unknown): unknown {
  if (!isObjectRecord(value)) {
    return value;
  }

  return pickDefined(value, ['id', 'name', 'quantity', 'unitPrice']);
}

function projectQuoteSelectedAssembly(value: unknown): unknown {
  if (!isObjectRecord(value)) {
    return value;
  }

  return pickDefined(value, ['id', 'productAssemblyId', 'quotedName', 'quotedPrice']);
}

function projectAdminUserSummary(value: unknown): unknown {
  if (!isObjectRecord(value)) {
    return value;
  }

  return pickDefined(value, ['id', 'name', 'email', 'role', 'phoneNumber', 'departments']);
}

function projectQuoteSalespersonSummary(value: unknown): unknown {
  if (!isObjectRecord(value)) {
    return value;
  }

  return pickDefined(value, ['id', 'name', 'email', 'role']);
}

function projectPartSupplier(value: Record<string, unknown>): Record<string, unknown> {
  const { thumbnailDataUrl: _thumbnailDataUrl, ...supplier } = value;

  return supplier;
}

function projectAuditEvent(value: unknown): unknown {
  if (!isObjectRecord(value)) {
    return value;
  }

  return {
    ...pickDefined(value, [
      'id',
      'occurredAt',
      'actorUserId',
      'actorName',
      'actorEmail',
      'entityType',
      'entityId',
      'action',
      'summary',
    ]),
    ...(isObjectRecord(value.actor) ? { actor: projectAdminUserSummary(value.actor) } : {}),
    ...(isObjectRecord(value.changes) ? { changes: projectAuditChangePreviews(value.changes) } : {}),
  };
}

function projectAuditChangePreviews(changes: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(changes).map(([field, change]) => {
      if (!isObjectRecord(change)) {
        return [field, previewAuditValue(change)];
      }

      return [
        field,
        {
          from: previewAuditValue(change.from),
          to: previewAuditValue(change.to),
        },
      ];
    }),
  );
}

function previewAuditValue(value: unknown): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return value.length <= 80 ? value : `${value.slice(0, 77)}...`;
  }

  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }

  if (isObjectRecord(value)) {
    const keys = Object.keys(value);
    return `[object:${keys.slice(0, 5).join(',')}${keys.length > 5 ? ',...' : ''}]`;
  }

  return value === undefined ? null : String(value);
}

function stripThumbnailDataUrls(value: unknown): { value: unknown; removed: number } {
  if (Array.isArray(value)) {
    let removed = 0;
    const items = value.map((item) => {
      const stripped = stripThumbnailDataUrls(item);
      removed += stripped.removed;
      return stripped.value;
    });

    return { removed, value: items };
  }

  if (value instanceof Date || !isObjectRecord(value)) {
    return { removed: 0, value };
  }

  let removed = 0;
  const entries: Array<[string, unknown]> = [];

  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase().endsWith('thumbnaildataurl')) {
      removed += 1;
      continue;
    }

    const stripped = stripThumbnailDataUrls(item);
    removed += stripped.removed;
    entries.push([key, stripped.value]);
  }

  return { removed, value: Object.fromEntries(entries) };
}

function enforceSerializedResultBudget(
  value: unknown,
  maxSerializedBytes: number,
): { serializedBytes: number; truncated: boolean; value: unknown } {
  let serializedBytes = getSerializedBytes(value);

  if (serializedBytes <= maxSerializedBytes) {
    return { serializedBytes, truncated: false, value };
  }

  let candidate = value;
  let truncated = false;

  for (let attempt = 0; attempt < 100 && serializedBytes > maxSerializedBytes; attempt += 1) {
    const largestArrayPath = findLargestReducibleArrayPath(candidate);

    if (!largestArrayPath) {
      break;
    }

    candidate = truncateArrayAtPath(candidate, largestArrayPath);
    truncated = true;
    serializedBytes = getSerializedBytes(candidate);
  }

  if (serializedBytes <= maxSerializedBytes) {
    return { serializedBytes, truncated, value: candidate };
  }

  const fallback = {
    [RESULT_TRUNCATION_MARKER_KEY]: true,
    message: `Tool result exceeded ${maxSerializedBytes} serialized bytes after projection.`,
    originalSerializedBytes: getSerializedBytes(value),
  };

  return {
    serializedBytes: getSerializedBytes(fallback),
    truncated: true,
    value: fallback,
  };
}

function findLargestReducibleArrayPath(value: unknown): Array<string | number> | null {
  const arrays: Array<{ path: Array<string | number>; savedBytes: number }> = [];

  collectReducibleArrayPaths(value, [], arrays);
  arrays.sort((a, b) => b.savedBytes - a.savedBytes);

  return arrays[0]?.path ?? null;
}

function collectReducibleArrayPaths(
  value: unknown,
  path: Array<string | number>,
  arrays: Array<{ path: Array<string | number>; savedBytes: number }>,
): boolean {
  if (Array.isArray(value)) {
    let hasReducibleDescendantArray = false;

    for (const [index, item] of value.entries()) {
      hasReducibleDescendantArray =
        collectReducibleArrayPaths(item, [...path, index], arrays) || hasReducibleDescendantArray;
    }

    const isReducible = getTruncatableArrayItems(value).length > 0;
    const savedBytes = isReducible ? getSerializedBytes(value) - getSerializedBytes(truncateArray(value)) : 0;
    const isUsefulReduction = savedBytes > 0;

    if (isUsefulReduction && !hasReducibleDescendantArray) {
      arrays.push({ path, savedBytes });
    }

    return isUsefulReduction || hasReducibleDescendantArray;
  }

  if (!isObjectRecord(value)) {
    return false;
  }

  let hasReducibleDescendantArray = false;

  for (const [key, item] of Object.entries(value)) {
    hasReducibleDescendantArray =
      collectReducibleArrayPaths(item, [...path, key], arrays) || hasReducibleDescendantArray;
  }

  return hasReducibleDescendantArray;
}

function truncateArrayAtPath(value: unknown, path: readonly (string | number)[]): unknown {
  if (path.length === 0) {
    return Array.isArray(value) ? truncateArray(value) : value;
  }

  const [head, ...tail] = path;

  if (Array.isArray(value) && typeof head === 'number') {
    return value.map((item, index) => (index === head ? truncateArrayAtPath(item, tail) : item));
  }

  if (isObjectRecord(value) && typeof head === 'string') {
    return {
      ...value,
      [head]: truncateArrayAtPath(value[head], tail),
    };
  }

  return value;
}

function truncateArray(value: readonly unknown[]): unknown[] {
  const existingMarker = getArrayTruncationMarker(value.at(-1));
  const truncatableItems = getTruncatableArrayItems(value);
  const keepCount = Math.floor(truncatableItems.length / 2);
  const omittedItems = truncatableItems.length - keepCount + (existingMarker?.omittedItems ?? 0);

  return [...truncatableItems.slice(0, keepCount), createArrayTruncationMarker(omittedItems)];
}

function getTruncatableArrayItems(value: readonly unknown[]): readonly unknown[] {
  const existingMarker = getArrayTruncationMarker(value.at(-1));
  const items = existingMarker ? value.slice(0, -1) : value;

  return items;
}

function createArrayTruncationMarker(omittedItems: number): Record<string, unknown> {
  return {
    [ARRAY_TRUNCATION_MARKER_KEY]: omittedItems,
    message: `${omittedItems} item${omittedItems === 1 ? '' : 's'} omitted to keep the tool result within the assistant context budget.`,
  };
}

function getArrayTruncationMarker(value: unknown): { omittedItems: number } | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const omittedItems = value[ARRAY_TRUNCATION_MARKER_KEY];

  return typeof omittedItems === 'number' ? { omittedItems } : null;
}

function getSerializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8');
}
