// The one place both business schemas are named together: the relational schema object handed to
// Drizzle. Everything else reaches tables through `@pkg/db` (shared) or `@pkg/db/equipment`.
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as auditSchema from './schema/audit.js';
import * as authSchema from './schema/auth.js';
import * as changelogSchema from './schema/changelog.js';
import * as contractingDirectorySchema from './schema/contracting/directory.js';
import * as contractingFleetSchema from './schema/contracting/fleet.js';
import * as contractingReadingSchema from './schema/contracting/hour-reading.js';
import * as contractingJobsSchema from './schema/contracting/jobs.js';
import * as contractingRateCardSchema from './schema/contracting/rate-card.js';
import * as customerSchema from './schema/equipment/customer.js';
import * as documentSchema from './schema/equipment/document.js';
import * as feedbackSchema from './schema/equipment/feedback.js';
import * as jobSchema from './schema/equipment/job.js';
import * as jobStockCloseOutSchema from './schema/equipment/job-stock-close-out.js';
import * as laborRateSchema from './schema/equipment/labor-rate-card.js';
import * as partSchema from './schema/equipment/part.js';
import * as productSchema from './schema/equipment/product.js';
import * as productRangeSchema from './schema/equipment/product-range.js';
import * as productUnitSchema from './schema/equipment/product-unit.js';
import * as purchaseOrderSchema from './schema/equipment/purchase-order.js';
import * as purchaseOrderAmendmentSchema from './schema/equipment/purchase-order-amendment.js';
import * as purchaseOrderLineArrivalSchema from './schema/equipment/purchase-order-line-arrival.js';
import * as quoteSchema from './schema/equipment/quote.js';
import * as stockMovementSchema from './schema/equipment/stock-movement.js';
import * as stocktakeSchema from './schema/equipment/stocktake.js';
import * as supplierSchema from './schema/equipment/supplier.js';
import * as userDepartmentSchema from './schema/equipment/user-department.js';

const {
  contractingChargeLinesRelations,
  contractingJobsRelations,
  contractingMachineAssignmentsRelations,
  contractingMeasuresRelations,
  ...contractingJobsTables
} = contractingJobsSchema;

export const schema = {
  ...contractingDirectorySchema,
  ...contractingJobsTables,
  // Drizzle 0.45's relation types key on the unqualified table name, so exposing these descriptors'
  // types would merge `contracting.job` with `equipment.job`. Runtime lookup is schema-qualified.
  contractingChargeLinesRelations: contractingChargeLinesRelations as unknown,
  contractingJobsRelations: contractingJobsRelations as unknown,
  contractingMachineAssignmentsRelations: contractingMachineAssignmentsRelations as unknown,
  contractingMeasuresRelations: contractingMeasuresRelations as unknown,
  ...contractingReadingSchema,
  ...contractingRateCardSchema,
  ...auditSchema,
  ...authSchema,
  ...changelogSchema,
  ...customerSchema,
  ...contractingFleetSchema,
  ...documentSchema,
  ...feedbackSchema,
  ...laborRateSchema,
  ...jobSchema,
  ...jobStockCloseOutSchema,
  ...partSchema,
  ...productRangeSchema,
  ...productSchema,
  ...productUnitSchema,
  ...purchaseOrderAmendmentSchema,
  ...purchaseOrderLineArrivalSchema,
  ...purchaseOrderSchema,
  ...quoteSchema,
  ...stockMovementSchema,
  ...stocktakeSchema,
  ...supplierSchema,
  ...userDepartmentSchema,
};

// Every Postgres schema the application owns tables in, so catalog sweeps and resets never keep a
// hand-written schema list.
export const applicationSchemas: readonly string[] = [
  ...new Set(
    (Object.values(schema) as unknown[])
      .filter((value): value is PgTable => is(value, PgTable))
      .map((table) => getTableConfig(table).schema ?? 'public'),
  ),
].sort();
