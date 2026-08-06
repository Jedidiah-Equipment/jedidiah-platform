import { hasPermission } from '@pkg/domain';
import type { AppPermission, UserAccessSummary } from '@pkg/schema';
import { initTRPC } from '@trpc/server';

import type { Context } from './context.js';
import { createAuthTRPCError, getTRPCAppCode, getTRPCPublicMessage } from './errors.js';

const t = initTRPC.context<Context>().create({
  errorFormatter({ error, shape }) {
    const appCode = getTRPCAppCode(error);

    return {
      ...shape,
      message: getTRPCPublicMessage(error, shape.message),
      data: {
        ...shape.data,
        ...(appCode ? { appCode } : {}),
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw createAuthTRPCError({
      appCode: 'auth.unauthenticated',
      code: 'UNAUTHORIZED',
      message: 'Please sign in to continue.',
    });
  }

  return next({
    ctx: {
      session: ctx.session,
    },
  });
});

export function authorizedProcedure(permission: AppPermission | readonly AppPermission[]) {
  const permissions = Array.isArray(permission) ? permission : [permission];

  return protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.access || !permissions.some((candidate) => hasPermission(ctx.access, candidate))) {
      throw createAuthTRPCError({
        appCode: 'auth.forbidden',
        code: 'FORBIDDEN',
        message: 'You do not have permission to perform this action.',
      });
    }

    return next({
      ctx: {
        access: ctx.access,
      },
    });
  });
}

type InventoryCostProjection<TOutput, TCostField extends keyof TOutput> = Omit<TOutput, TCostField> & {
  [Field in TCostField]: TOutput[Field] | null;
};

export type InventoryCostAccess = Pick<UserAccessSummary, 'permissions'> | null | undefined;

export function canReadInventoryCosts(access: InventoryCostAccess): boolean {
  return hasPermission(access, 'inventory_cost:read');
}

/**
 * The server-side cost gate (spec §11). `costFields` always comes from the contract that owns the
 * row — `declareInventoryCostFields` in `@pkg/schema` — so a contract cannot gain a cost field the
 * gate does not know about; `inventory-cost.test.ts` there fails when one does.
 */
export function projectInventoryCostFields<
  TCostField extends PropertyKey,
  TOutput extends Record<TCostField, unknown>,
>({
  access,
  costFields,
  output,
}: {
  access: InventoryCostAccess;
  costFields: readonly TCostField[];
  output: TOutput;
}): InventoryCostProjection<TOutput, TCostField> {
  if (canReadInventoryCosts(access)) {
    return output;
  }

  return Object.assign(
    { ...output },
    Object.fromEntries(costFields.map((field) => [field, null])),
  ) as InventoryCostProjection<TOutput, TCostField>;
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
>({
  access,
  costFields,
  report,
  rowCostFields,
  rowsField,
}: {
  access: InventoryCostAccess;
  costFields: readonly TReportCostField[];
  report: TReport & Record<TRowsField, readonly unknown[]>;
  rowCostFields: readonly TRowCostField[];
  rowsField: TRowsField;
}): InventoryCostReportProjection<TReport, TReportCostField, TRowsField, TRowCostField> {
  const rows = (report[rowsField] as ReadonlyArray<Record<TRowCostField, unknown>>).map((row) =>
    projectInventoryCostFields({ access, costFields: rowCostFields, output: row }),
  );

  return projectInventoryCostFields({
    access,
    costFields,
    output: Object.assign({ ...report }, { [rowsField]: rows }),
  }) as InventoryCostReportProjection<TReport, TReportCostField, TRowsField, TRowCostField>;
}
