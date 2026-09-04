import { ProductBay } from '@pkg/schema/equipment';

export const ProductBayResponse = ProductBay.pick({ defaultWorkingDays: true }).extend({
  bay: ProductBay.shape.bay.pick({ department: true, id: true, name: true }),
});
