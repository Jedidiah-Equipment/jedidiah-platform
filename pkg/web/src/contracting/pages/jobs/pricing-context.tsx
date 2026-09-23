import type { JobDetail, Rate } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { toast } from 'sonner';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { getApiErrorAppCode } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

export function usePricingMutations() {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  const options = (message: string) => ({
    onSuccess: invalidateJobs,
    onError: (error: unknown) => showError(error, message),
  });
  return {
    setRate: useMutation(trpc.contractingJobs.pricing.setStintRate.mutationOptions(options('Unable to set the Rate.'))),
    clearRate: useMutation(
      trpc.contractingJobs.pricing.clearStintRate.mutationOptions(options('Unable to clear the Rate.')),
    ),
    setAmount: useMutation(
      trpc.contractingJobs.pricing.setStintAmount.mutationOptions(options('Unable to change the amount.')),
    ),
    setDiesel: useMutation(trpc.contractingJobs.pricing.setDiesel.mutationOptions(options('Unable to price Diesel.'))),
    setDiscount: useMutation(
      trpc.contractingJobs.pricing.setDiscount.mutationOptions(options('Unable to set the Discount.')),
    ),
    markPriced: useMutation(
      trpc.contractingJobs.pricing.markPriced.mutationOptions({
        onSuccess: async () => {
          await invalidateJobs();
          toast.success('Job priced');
        },
        onError: async (error) => {
          if (getApiErrorAppCode(error) === 'contracting_job.total_changed') {
            toast.error('The total changed while you were pricing — review it and mark as Priced again.');
            await invalidateJobs();
          } else showError(error, 'Unable to mark the Job as Priced.');
        },
      }),
    ),
  };
}

export type PricingMutations = ReturnType<typeof usePricingMutations>;

/** What every Pricing cell reads: the Job, whether this person prices it, the Rate Card, and the writes. */
type Pricing = { job: JobDetail; editable: boolean; rates: readonly Rate[]; mutations: PricingMutations };

export const PricingContext = createContext<Pricing | null>(null);

export function usePricing() {
  const pricing = useContext(PricingContext);
  if (!pricing) throw new Error('Pricing cells render inside PricingCard.');
  return pricing;
}
