import { listInventoryQuoteOptions, listQuoteStock } from '@pkg/core/equipment';
import {
  InventoryQuoteOptionListInput,
  InventoryQuoteOptionListResult,
  QuoteStockInput,
  QuoteStockResult,
  QuoteStockRowCostFields,
} from '@pkg/schema/equipment';

import { projectInventoryCostFields } from '../../../equipment/trpc/inventory-cost-projection.js';
import { authorizedProcedure, router } from '../../../trpc/init.js';
import { mapCheckoutErrors } from './inventory-error-families.js';

/**
 * The Quote facts a stores surface reads. They are gated on inventory permissions because the stores
 * role holds none over Quotes, and they sit on their own root so a Quote write can refresh them
 * without invalidating the inventory reads that replay the whole ledger.
 */
export const inventoryQuotesRouter = router({
  /**
   * The Parts Sales a stores surface may draw to or return from. Carries no price, so `stores` reads
   * it without any Quote permission.
   */
  quoteOptions: authorizedProcedure('equipment_inventory:move')
    .input(InventoryQuoteOptionListInput)
    .output(InventoryQuoteOptionListResult)
    .query(({ ctx, input }) => listInventoryQuoteOptions({ db: ctx.db, input })),

  quoteStock: authorizedProcedure('equipment_inventory:read')
    .input(QuoteStockInput)
    .output(QuoteStockResult)
    .query(async ({ ctx, input }) => {
      const result = await mapCheckoutErrors(() => listQuoteStock({ db: ctx.db, quoteId: input.quoteId }));

      return {
        ...result,
        items: result.items.map((item) =>
          projectInventoryCostFields({ access: ctx.access, costFields: QuoteStockRowCostFields, output: item }),
        ),
      };
    }),
});
