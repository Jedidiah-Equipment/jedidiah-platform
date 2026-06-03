export type QuotePricingResult =
  | {
      allowed: true;
      reason: null;
    }
  | {
      allowed: false;
      reason: string;
    };

export const QUOTE_DOCUMENT_VAT_PERCENT = 15;

export function validateDiscount({
  basePrice,
  discountAmount,
}: {
  basePrice: number;
  discountAmount: number;
}): QuotePricingResult {
  if (discountAmount < 0) {
    return deny('Discount must be zero or greater.');
  }

  if (discountAmount > basePrice) {
    return deny('Discount cannot be greater than the product base price.');
  }

  return { allowed: true, reason: null };
}

export function computeQuoteTotal({
  deliveryIncluded = false,
  deliveryPrice = 0,
  discountAmount,
  quotedBasePrice,
  selectedAssemblyPrices = [],
}: {
  deliveryIncluded?: boolean;
  deliveryPrice?: number;
  discountAmount: number;
  quotedBasePrice: number;
  selectedAssemblyPrices?: readonly number[];
}): number {
  const selectedAssemblyTotal = selectedAssemblyPrices.reduce((total, price) => total + price, 0);

  return Math.max(0, quotedBasePrice + selectedAssemblyTotal - discountAmount) + (deliveryIncluded ? deliveryPrice : 0);
}

function deny(reason: string): QuotePricingResult {
  return { allowed: false, reason };
}
