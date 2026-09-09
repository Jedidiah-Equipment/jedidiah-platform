import { WORK_ITEM_DEPARTMENTS, type WorkItemDepartment } from '@pkg/domain/equipment';
import { sql } from 'drizzle-orm';
import { check, numeric, text } from 'drizzle-orm/pg-core';
import { equipmentSchema } from './pg-schema.js';

export const laborDepartmentRates = equipmentSchema.table(
  'labor_department_rate',
  {
    id: text('department').$type<WorkItemDepartment>().primaryKey(),
    costToCompanyRate: numeric('cost_to_company_rate', { mode: 'number', scale: 2 }),
    billingRate: numeric('billing_rate', { mode: 'number', scale: 2 }),
    consumablesPercentage: numeric('consumables_percentage', { mode: 'number' }),
  },
  (table) => [
    check(
      'labor_department_rate_department',
      sql`${table.id} in (${sql.raw(WORK_ITEM_DEPARTMENTS.map((department) => `'${department}'`).join(', '))})`,
    ),
    check('labor_department_rate_cost_nonnegative', sql`${table.costToCompanyRate} >= 0`),
    check('labor_department_rate_billing_nonnegative', sql`${table.billingRate} >= 0`),
    check('labor_department_rate_consumables_nonnegative', sql`${table.consumablesPercentage} >= 0`),
  ],
);

export const laborRateSettings = equipmentSchema.table(
  'labor_rate_settings',
  {
    id: text('id').primaryKey().default('labor-rate-card'),
    managementOverheadPercentage: numeric('management_overhead_percentage', { mode: 'number' }).notNull(),
    hoursPerWorkingDay: numeric('hours_per_working_day', { mode: 'number' }).notNull(),
  },
  (table) => [
    check('labor_rate_settings_singleton', sql`${table.id} = 'labor-rate-card'`),
    check('labor_rate_settings_management_nonnegative', sql`${table.managementOverheadPercentage} >= 0`),
    check('labor_rate_settings_hours_bounds', sql`${table.hoursPerWorkingDay} between 1 and 24`),
  ],
);
