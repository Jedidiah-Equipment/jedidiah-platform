import { getLaborRateCard, updateLaborRateCard } from '@pkg/core/equipment';
import { laborBillingRates } from '@pkg/domain/equipment';
import {
  LaborDepartmentRateCostFields,
  type LaborRateCard,
  LaborRateCardCostFields,
  LaborRateCardUpdateInput,
} from '@pkg/schema/equipment';
import {
  type InventoryCostAccess,
  projectInventoryCostReport,
} from '../../../equipment/trpc/inventory-cost-projection.js';
import { authorizedProcedure, protectedProcedure, router } from '../../../trpc/init.js';

export const laborRatesRouter = router({
  get: authorizedProcedure('equipment_labor_rate:read').query(async ({ ctx }) =>
    gated(await getLaborRateCard({ db: ctx.db }), ctx.access),
  ),
  update: authorizedProcedure('equipment_labor_rate:update')
    .input(LaborRateCardUpdateInput)
    .mutation(async ({ ctx, input }) =>
      gated(await updateLaborRateCard({ db: ctx.db, actorUserId: ctx.session.user.id, input }), ctx.access),
    ),
  billing: protectedProcedure.query(async ({ ctx }) => laborBillingRates(await getLaborRateCard({ db: ctx.db }))),
});

function gated(card: LaborRateCard, access: InventoryCostAccess) {
  return projectInventoryCostReport({
    access,
    costFields: LaborRateCardCostFields,
    report: card,
    rowCostFields: LaborDepartmentRateCostFields,
    rowsField: 'rates',
  });
}
