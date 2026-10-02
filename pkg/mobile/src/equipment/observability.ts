import {
  type MutationEventCatalog,
  type ObservabilityProperties,
  pickRecordIds,
  pickStringFields,
} from '@/lib/observability-contract';

const id =
  (property: string, eventProperty = `${property}Id`) =>
  (variables: unknown) =>
    pickStringFields(variables, [[property, eventProperty]]);

const jobTimingProperties = (variables: unknown) =>
  pickStringFields(variables, [
    ['id', 'jobId'],
    ['department', 'department'],
  ]);

export const EQUIPMENT_MUTATION_EVENTS = {
  'quotes.create': { event: 'quote created', properties: (_variables, data) => id('id', 'quoteId')(data) },
  'quotes.update': { event: 'quote updated', properties: id('id', 'quoteId') },
  'quotes.cancel': { event: 'quote cancelled', properties: id('id', 'quoteId') },
  'quotes.generateDocument': { event: 'quote document generated', properties: id('quoteId') },
  'jobs.startDepartmentTiming': { event: 'department timing started', properties: jobTimingProperties },
  'jobs.updateDepartmentTiming': { event: 'department timing updated', properties: jobTimingProperties },
  'jobs.completeDepartmentTiming': { event: 'department timing completed', properties: jobTimingProperties },
  'inventory.postCheckout': {
    event: 'part checked out',
    properties: (variables) => pickRecordIds(variables, ['jobId', 'partId']),
  },
  'inventory.postReturnToStore': {
    event: 'part returned to store',
    properties: (variables) => pickRecordIds(variables, ['jobId', 'partId']),
  },
  'purchaseOrders.receive': {
    event: 'part received',
    properties: (variables) => pickRecordIds(variables, ['partId', 'purchaseOrderId']),
  },
  'purchaseOrders.returnToSupplier': {
    event: 'part returned to supplier',
    properties: (variables) => pickRecordIds(variables, ['partId', 'purchaseOrderId']),
  },
  'inventory.postStockCount': {
    event: 'stock count posted',
    properties: (variables) => pickRecordIds(variables, ['partId', 'sessionId']),
  },
  'inventory.openStocktakeSession': {
    event: 'stocktake opened',
    properties: (variables, data) => ({
      ...id('id', 'sessionId')(data),
      ...pickStringFields(variables, [['scope', 'scope']]),
    }),
  },
  'inventory.closeStocktakeSession': { event: 'stocktake closed', properties: id('sessionId') },
  'inventory.closeOutJob': { event: 'job closed out', properties: id('jobId') },
  'feedback.submit': { event: 'feedback submitted', properties: id('jobId') },
  'jobActivity.setLastActivitySeen': { event: 'activity marked seen', properties: () => ({}) },
} satisfies MutationEventCatalog;

export function mutationEventProperties(
  procedure: keyof typeof EQUIPMENT_MUTATION_EVENTS,
  variables: unknown,
  data?: unknown,
): ObservabilityProperties {
  return EQUIPMENT_MUTATION_EVENTS[procedure].properties(variables, data);
}
