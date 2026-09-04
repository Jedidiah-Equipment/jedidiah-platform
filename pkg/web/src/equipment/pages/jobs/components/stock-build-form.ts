import { UUID } from '@pkg/schema';
import { type ProductBay, StockBuildCreateInput } from '@pkg/schema/equipment';
import { z } from 'zod';

import { requiredSelection } from '@/components/form/utils/form-schema.js';

import {
  type BaySeedScheduling,
  getBaySeedDefaultStartDate,
  JobBaySeedFormValues,
  toJobBaySeedInputs,
} from './job-bay-seeds.js';

export type StockBuildFormValues = z.infer<typeof StockBuildFormValues>;
export const StockBuildFormValues = z.object({
  baySeeds: z.array(JobBaySeedFormValues),
  /** The Optional Assemblies to fit — the Job's Build Spec, and the only source of its CFO. */
  buildSpecAssemblyIds: z.array(UUID),
  productId: requiredSelection(UUID, 'Select a product'),
});

export const emptyStockBuildFormValues: StockBuildFormValues = {
  baySeeds: [],
  buildSpecAssemblyIds: [],
  productId: '',
};

/**
 * The Bay seeds a newly picked Product brings with it, matching what a Quote-sourced Job gets: its
 * enabled Product Bays at their default working days. Picking a different Product replaces them
 * wholesale, because seeds carried over from another Product describe the wrong build.
 */
export function toStockBuildBaySeeds({
  productBays,
  scheduling,
}: {
  productBays: readonly ProductBay[];
  scheduling: BaySeedScheduling | null;
}): StockBuildFormValues['baySeeds'] {
  return productBays
    .filter((productBay) => !productBay.bay.disabledAt)
    .map((productBay) => ({
      bayId: productBay.bayId,
      durationDays: productBay.defaultWorkingDays,
      startDate: getBaySeedDefaultStartDate(scheduling, productBay.bayId),
    }));
}

export function toStockBuildCreateInput(value: StockBuildFormValues): StockBuildCreateInput {
  return StockBuildCreateInput.parse({
    baySeeds: toJobBaySeedInputs(value.baySeeds),
    buildSpecAssemblyIds: value.buildSpecAssemblyIds,
    productId: value.productId,
  });
}
