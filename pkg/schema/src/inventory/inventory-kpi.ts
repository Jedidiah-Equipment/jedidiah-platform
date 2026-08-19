import { z } from 'zod';

import { UUID } from '../common/uuid.js';
import { declareInventoryCostFields, InventoryValue } from './inventory-cost.js';
import { StockAdjustmentReason } from './stock-movement.js';

/** Current-month adjustment magnitude grouped by the ledger reason that explains it. */
export const InventoryKpiAdjustment = z.object({
  reason: StockAdjustmentReason,
  value: InventoryValue,
});
export const InventoryKpiAdjustmentCostFields = declareInventoryCostFields(InventoryKpiAdjustment, 'value');

/** Current-month scrap magnitude for one Part, priced at its current moving average. */
export const InventoryKpiScrapItem = z.object({
  partCode: z.string(),
  partId: UUID,
  partName: z.string(),
  value: InventoryValue,
});
export const InventoryKpiScrapItemCostFields = declareInventoryCostFields(InventoryKpiScrapItem, 'value');

export type InventoryKpis = z.infer<typeof InventoryKpis>;
export const InventoryKpis = z.object({
  adjustments: z.array(InventoryKpiAdjustment),
  /** Annualized trailing-90-day net consumption divided by current perpetual-stock value. */
  inventoryTurns: z.number().finite().nullable(),
  inventoryValue: InventoryValue,
  scrapItems: z.array(InventoryKpiScrapItem),
  trailing90DayConsumptionValue: InventoryValue,
});
export const InventoryKpisCostFields = declareInventoryCostFields(
  InventoryKpis,
  'inventoryValue',
  'trailing90DayConsumptionValue',
);
