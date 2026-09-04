// The one place both business schemas are named together: the relational schema object handed to
// Drizzle. Everything else reaches tables through `@pkg/db` (shared) or `@pkg/db/equipment`.
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';

import * as auditSchema from './schema/audit.js';
import * as authSchema from './schema/auth.js';
import * as changelogSchema from './schema/changelog.js';
import * as customerSchema from './schema/equipment/customer.js';
import * as documentSchema from './schema/equipment/document.js';
import * as feedbackSchema from './schema/equipment/feedback.js';
import * as jobSchema from './schema/equipment/job.js';
import * as jobStockCloseOutSchema from './schema/equipment/job-stock-close-out.js';
import * as partSchema from './schema/equipment/part.js';
import * as productSchema from './schema/equipment/product.js';
import * as productRangeSchema from './schema/equipment/product-range.js';
import * as productUnitSchema from './schema/equipment/product-unit.js';
import * as purchaseOrderSchema from './schema/equipment/purchase-order.js';
import * as purchaseOrderAmendmentSchema from './schema/equipment/purchase-order-amendment.js';
import * as quoteSchema from './schema/equipment/quote.js';
import * as stockMovementSchema from './schema/equipment/stock-movement.js';
import * as stocktakeSchema from './schema/equipment/stocktake.js';
import * as supplierSchema from './schema/equipment/supplier.js';
import * as userDepartmentSchema from './schema/equipment/user-department.js';

export const schema = {
  ...auditSchema,
  ...authSchema,
  ...changelogSchema,
  ...customerSchema,
  ...documentSchema,
  ...feedbackSchema,
  ...jobSchema,
  ...jobStockCloseOutSchema,
  ...partSchema,
  ...productRangeSchema,
  ...productSchema,
  ...productUnitSchema,
  ...purchaseOrderAmendmentSchema,
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
