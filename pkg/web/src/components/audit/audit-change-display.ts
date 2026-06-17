import { formatCurrency, formatDate, formatPercent } from '@pkg/domain';

export type AuditChange = { from?: unknown; to?: unknown };
export type AuditChangeMap = Record<string, AuditChange>;

export type AuditChangeDisplay = {
  field: string;
  from: string;
  key: string;
  preview: string;
  to: string;
};

const auditFieldLabels: Record<string, string> = {
  address: 'Address',
  actualEnd: 'Actual end',
  actualStart: 'Actual start',
  basePrice: 'Base price',
  byteSize: 'Byte size',
  code: 'Code',
  companyName: 'Company name',
  completedAt: 'Completed at',
  contactPerson: 'Contact person',
  contentType: 'Content type',
  currencyCode: 'Currency',
  customerId: 'Customer',
  depositPercent: 'Deposit percent',
  department: 'Department',
  description: 'Description',
  disabledAt: 'Disabled at',
  discountPercent: 'Discount percent',
  email: 'Email',
  filename: 'Filename',
  buildTimeDays: 'Build time (days)',
  jobId: 'Job',
  member: 'Department membership',
  modelCode: 'Model code',
  name: 'Name',
  notes: 'Notes',
  ownerType: 'Owner type',
  phone: 'Phone',
  plannedDeliveryDate: 'Planned delivery date',
  plannedEnd: 'Planned end',
  plannedStart: 'Planned start',
  price: 'Price',
  productId: 'Product',
  preferredDeliveryDate: 'Preferred delivery date',
  quoteId: 'Quote',
  quotedBasePrice: 'Quoted base price',
  quotedCurrencyCode: 'Quoted currency',
  rangeId: 'Product Range',
  requiresVinNumber: 'Requires VIN number',
  salesPersonId: 'Salesperson',
  scheduleOrigin: 'Schedule origin',
  sourceProductId: 'Source product',
  startedAt: 'Started at',
  status: 'Status',
  storageKey: 'Storage key',
  uploaderUserId: 'Uploader',
  validUntil: 'Valid until',
};

const currencyFields = new Set(['basePrice', 'price', 'quotedBasePrice']);
const dateFields = new Set([
  'actualEnd',
  'actualStart',
  'completedAt',
  'disabledAt',
  'plannedEnd',
  'plannedStart',
  'plannedDeliveryDate',
  'preferredDeliveryDate',
  'scheduleOrigin',
  'startedAt',
  'validUntil',
]);
const percentFields = new Set(['depositPercent', 'discountPercent']);

export function getAuditChangeDisplays(changes: AuditChangeMap | null): AuditChangeDisplay[] {
  if (!changes) {
    return [];
  }

  return Object.entries(changes).map(([key, change]) => ({
    field: getAuditFieldLabel(key),
    from: formatAuditChangeValue(key, change.from),
    key,
    preview: formatAuditChangePreview(key, change),
    to: formatAuditChangeValue(key, change.to),
  }));
}

export function getAuditFieldLabel(field: string): string {
  return (
    auditFieldLabels[field] ??
    field
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .replace(/^./, (char) => char.toUpperCase())
  );
}

export function formatAuditChangeValue(field: string, value: unknown): string {
  if (value === null || value === undefined) {
    return 'None';
  }

  if (typeof value === 'string' && value.trim() === '') {
    return 'Empty';
  }

  if (currencyFields.has(field) && typeof value === 'number') {
    return formatCurrency(value);
  }

  if (percentFields.has(field) && typeof value === 'number') {
    return formatPercent(value);
  }

  if (dateFields.has(field) && (typeof value === 'string' || typeof value === 'number' || value instanceof Date)) {
    const formattedDate = formatValidDate(value);

    if (formattedDate) {
      return formattedDate;
    }
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'object') {
    return stringifyJsonValue(value);
  }

  return String(value);
}

export function formatAuditChangesJson(changes: AuditChangeMap): string {
  return JSON.stringify(changes, null, 2);
}

function formatAuditChangePreview(field: string, change: AuditChange): string {
  const label = getAuditFieldLabel(field);
  const from = formatAuditChangeValue(field, change.from);
  const to = formatAuditChangeValue(field, change.to);

  if (shouldCollapsePreview(change.from) || shouldCollapsePreview(change.to) || from.length + to.length > 42) {
    return `${label} changed`;
  }

  return `${label}: ${from} -> ${to}`;
}

function formatValidDate(value: string | number | Date): string | undefined {
  const candidate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(candidate.getTime())) {
    return undefined;
  }

  return formatDate(candidate, 'medium');
}

function stringifyJsonValue(value: object): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function shouldCollapsePreview(value: unknown): boolean {
  if (value && typeof value === 'object') {
    return true;
  }

  return typeof value === 'string' && value.length > 28;
}
