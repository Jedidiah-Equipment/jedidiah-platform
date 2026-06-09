import { type Bay, JobBaySeedInput, JobCreateInput, type ProductBay, type QuoteDetail, type UUID } from '@pkg/schema';
import { z } from 'zod';

const JobCreateBaySeedFormRow = JobBaySeedInput.extend({
  rowKey: z.string().min(1),
});

export type JobCreateFormValues = z.infer<typeof JobCreateFormValues>;
export const JobCreateFormValues = z.object({
  baySeeds: z.array(JobCreateBaySeedFormRow),
});

export const emptyJobCreateFormValues: JobCreateFormValues = { baySeeds: [] };

export function toJobCreateFormValues(quote: Pick<QuoteDetail, 'productBays'>): JobCreateFormValues {
  return {
    baySeeds: quote.productBays
      .filter((productBay) => !productBay.bay.disabledAt)
      .map((productBay) => ({
        bayId: productBay.bayId,
        durationDays: productBay.defaultWorkingDays,
        rowKey: `product-bay:${productBay.bayId}`,
      })),
  };
}

export function toJobCreateInput({ quoteId, value }: { quoteId: UUID; value: JobCreateFormValues }): JobCreateInput {
  return JobCreateInput.parse({
    baySeeds: value.baySeeds.map(({ bayId, durationDays }) => ({ bayId, durationDays })),
    quoteId,
  });
}

export function getBaySeedBayMap({
  enabledBays,
  productBays,
}: {
  enabledBays: Bay[];
  productBays: ProductBay[];
}): Map<UUID, Bay> {
  const baysById = new Map<UUID, Bay>(enabledBays.map((bay) => [bay.id, bay]));

  for (const productBay of productBays) {
    if (!productBay.bay.disabledAt) {
      baysById.set(productBay.bayId, productBay.bay);
    }
  }

  return baysById;
}
