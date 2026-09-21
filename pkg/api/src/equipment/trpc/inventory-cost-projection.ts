import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';

// Distributive, so a contract that is a union keeps its members instead of collapsing to their shared keys.
type InventoryCostProjection<TOutput, TCostField extends keyof TOutput> = TOutput extends unknown
  ? Omit<TOutput, TCostField> & { [Field in TCostField]: TOutput[Field] | null }
  : never;

export type InventoryCostAccess = Pick<UserAccessSummary, 'permissions'> | null | undefined;

export function canReadInventoryCosts(access: InventoryCostAccess): boolean {
  return hasPermission(access, 'equipment_inventory_cost:read');
}

/**
 * The server-side cost gate (spec §11). `costFields` always comes from the contract that owns the
 * row — `declareInventoryCostFields` in `@pkg/schema` — so a contract cannot gain a cost field the
 * gate does not know about; `inventory-cost.test.ts` there fails when one does.
 */
export function projectInventoryCostFields<
  TCostField extends PropertyKey,
  TOutput extends Record<TCostField, unknown>,
>(input: {
  access: InventoryCostAccess;
  costFields: readonly TCostField[];
  output: TOutput;
}): InventoryCostProjection<TOutput, TCostField>;
export function projectInventoryCostFields({
  access,
  costFields,
  output,
}: {
  access: InventoryCostAccess;
  costFields: readonly PropertyKey[];
  output: Record<PropertyKey, unknown>;
}): Record<PropertyKey, unknown> {
  if (canReadInventoryCosts(access)) {
    return output;
  }

  return Object.assign({ ...output }, Object.fromEntries(costFields.map((field) => [field, null])));
}

/** The element type of the array field a report keeps its rows in. */
type InventoryCostReportRow<
  TReport,
  TRowsField extends keyof TReport,
> = TReport[TRowsField] extends readonly (infer TRow)[] ? TRow : never;

type InventoryCostReportProjection<
  TReport,
  TReportCostField extends keyof TReport,
  TRowsField extends keyof TReport,
  TRowCostField extends keyof InventoryCostReportRow<TReport, TRowsField>,
> = Omit<TReport, TReportCostField | TRowsField> & {
  [Field in TReportCostField]: TReport[Field] | null;
} & {
  [Field in TRowsField]: Array<InventoryCostProjection<InventoryCostReportRow<TReport, TRowsField>, TRowCostField>>;
};

/**
 * A report whose own totals are gated and whose rows each carry gated fields of their own. Both
 * passes belong to one call because they are one decision: a report projected without its rows is a
 * priced answer served to a price-blind reader, and that omission is invisible at the call site —
 * the outer projection compiles and the response looks gated. Every such report goes through here.
 */
export function projectInventoryCostReport<
  TReport,
  TReportCostField extends keyof TReport,
  TRowsField extends keyof TReport,
  TRowCostField extends keyof InventoryCostReportRow<TReport, TRowsField>,
>(input: {
  access: InventoryCostAccess;
  costFields: readonly TReportCostField[];
  report: TReport & Record<TRowsField, readonly unknown[]>;
  rowCostFields: readonly TRowCostField[];
  rowsField: TRowsField;
}): InventoryCostReportProjection<TReport, TReportCostField, TRowsField, TRowCostField>;
export function projectInventoryCostReport({
  access,
  costFields,
  report,
  rowCostFields,
  rowsField,
}: {
  access: InventoryCostAccess;
  costFields: readonly PropertyKey[];
  report: Record<PropertyKey, unknown>;
  rowCostFields: readonly PropertyKey[];
  rowsField: PropertyKey;
}): Record<PropertyKey, unknown> {
  const rows = (report[rowsField] as ReadonlyArray<Record<PropertyKey, unknown>>).map((row) =>
    projectInventoryCostFields({ access, costFields: rowCostFields, output: row }),
  );

  return projectInventoryCostFields({ access, costFields, output: { ...report, [rowsField]: rows } });
}
