import type { JobDetail, Rate } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { useTRPC } from '@/lib/trpc.js';
import { useJobWrite } from './use-job-write.js';

export function usePricingMutations() {
  const trpc = useTRPC();
  const write = useJobWrite();
  return {
    setRate: useMutation(
      trpc.contractingJobs.pricing.setStintRate.mutationOptions(write.card('Unable to set the Rate.')),
    ),
    clearRate: useMutation(
      trpc.contractingJobs.pricing.clearStintRate.mutationOptions(write.card('Unable to clear the Rate.')),
    ),
    setAmount: useMutation(
      trpc.contractingJobs.pricing.setStintAmount.mutationOptions(write.card('Unable to change the amount.')),
    ),
    setDiesel: useMutation(
      trpc.contractingJobs.pricing.setDiesel.mutationOptions(write.card('Unable to price Diesel.')),
    ),
    setDiscount: useMutation(
      trpc.contractingJobs.pricing.setDiscount.mutationOptions(write.card('Unable to set the Discount.')),
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
