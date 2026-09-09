import { getLaborRateCard, updateLaborRateCard } from '@pkg/core/equipment';
import { hasPermission } from '@pkg/domain';
import { type LaborRateCard, LaborRateCardUpdateInput, type VisibleLaborRateCard } from '@pkg/schema/equipment';
import { authorizedProcedure, protectedProcedure, router } from '../../../trpc/init.js';

export const laborRatesRouter = router({
  get: authorizedProcedure('equipment_labor_rate:read').query(async ({ ctx }) =>
    visibleCard(await getLaborRateCard({ db: ctx.db }), ctx.access),
  ),
  update: authorizedProcedure('equipment_labor_rate:update')
    .input(LaborRateCardUpdateInput)
    .mutation(async ({ ctx, input }) =>
      visibleCard(await updateLaborRateCard({ db: ctx.db, actorUserId: ctx.session.user.id, input }), ctx.access),
    ),
  billing: protectedProcedure.query(async ({ ctx }) => {
    const card = await getLaborRateCard({ db: ctx.db });
    return {
      hoursPerWorkingDay: card.hoursPerWorkingDay,
      rates: card.rates.map(({ department, billingRate }) => ({ department, billingRate })),
    };
  }),
});

function visibleCard(card: LaborRateCard, access: Parameters<typeof hasPermission>[0]): VisibleLaborRateCard {
  if (hasPermission(access, 'equipment_inventory_cost:read')) return card;
  return {
    hoursPerWorkingDay: card.hoursPerWorkingDay,
    rates: card.rates.map(({ department, billingRate }) => ({ department, billingRate })),
  };
}
