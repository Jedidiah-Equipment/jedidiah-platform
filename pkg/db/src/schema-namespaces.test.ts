import { getTableUniqueName, is, Table } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import * as schemaExports from './schema.js';

describe('database schema namespaces', () => {
  it('keeps only business-blind mechanism in public and classifies every other table as equipment', () => {
    const tableNames = [
      ...new Set(
        (Object.values(schemaExports) as unknown[])
          .filter((value): value is Table => is(value, Table))
          .map(getTableUniqueName),
      ),
    ].sort();

    expect(tableNames).toEqual([
      'equipment.assembly_overrides',
      'equipment.assembly_parts',
      'equipment.credit_note_settlement',
      'equipment.customers',
      'equipment.documents',
      'equipment.feedback',
      'equipment.feedback_department',
      'equipment.feedback_user',
      'equipment.invoice_extraction',
      'equipment.invoice_flag_resolution',
      'equipment.job',
      'equipment.job_bay',
      'equipment.job_bay_calendar_exception',
      'equipment.job_bay_operator_assignment',
      'equipment.job_build_spec_assembly',
      'equipment.job_cfo_assembly',
      'equipment.job_cfo_part',
      'equipment.job_department_crew',
      'equipment.job_department_timing',
      'equipment.job_estimate_snapshot',
      'equipment.job_slot',
      'equipment.job_stock_close_out',
      'equipment.part_bom',
      'equipment.parts',
      'equipment.product_assemblies',
      'equipment.product_bay',
      'equipment.product_labor_hours',
      'equipment.product_material_line',
      'equipment.product_range_variants',
      'equipment.product_ranges',
      'equipment.product_serial_sequence',
      'equipment.product_unit',
      'equipment.product_unit_ownership_transfer',
      'equipment.products',
      'equipment.purchase_order',
      'equipment.purchase_order_amendment',
      'equipment.purchase_order_job_link',
      'equipment.purchase_order_line',
      'equipment.quote',
      'equipment.quote_selected_assemblies',
      'equipment.quote_work_item_parts',
      'equipment.quote_work_items',
      'equipment.stock_build',
      'equipment.stock_movement',
      'equipment.stocktake_session',
      'equipment.supplier',
      'equipment.user_department',
      'equipment.working_calendar_off_day',
      'public.account',
      'public.audit_events',
      'public.changelog_view',
      'public.session',
      'public.user',
      'public.verification',
    ]);
  });
});
