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

export function validateDiscount({ discountPercent }: { discountPercent: number }): QuotePricingResult {
  if (discountPercent < 0) {
    return deny('Discount must be zero or greater.');
  }

  if (discountPercent > 100) {
    return deny('Discount must be 100 or less.');
  }

  return { allowed: true, reason: null };
}

export function computeQuoteDiscountAmount({
  discountPercent,
  quotedBasePrice,
  selectedAssemblyPrices = [],
}: {
  discountPercent: number;
  quotedBasePrice: number;
  selectedAssemblyPrices?: readonly number[];
}): number {
  const selectedAssemblyTotal = selectedAssemblyPrices.reduce((total, price) => total + price, 0);

  return roundCurrency((quotedBasePrice + selectedAssemblyTotal) * (discountPercent / 100));
}

export function computeQuoteTotal({
  deliveryIncluded = false,
  deliveryPrice = 0,
  discountPercent,
  quotedBasePrice,
  selectedAssemblyPrices = [],
}: {
  deliveryIncluded?: boolean;
  deliveryPrice?: number;
  discountPercent: number;
  quotedBasePrice: number;
  selectedAssemblyPrices?: readonly number[];
}): number {
  const selectedAssemblyTotal = selectedAssemblyPrices.reduce((total, price) => total + price, 0);
  const discountAmount = computeQuoteDiscountAmount({ discountPercent, quotedBasePrice, selectedAssemblyPrices });

  return Math.max(0, quotedBasePrice + selectedAssemblyTotal - discountAmount) + (deliveryIncluded ? deliveryPrice : 0);
}

function deny(reason: string): QuotePricingResult {
  return { allowed: false, reason };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
