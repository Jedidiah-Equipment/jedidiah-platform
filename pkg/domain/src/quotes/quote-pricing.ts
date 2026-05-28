export type QuotePricingResult =
  | {
      allowed: true;
      reason: null;
    }
  | {
      allowed: false;
      reason: string;
    };

export function validateDiscount({ basePrice, discount }: { basePrice: number; discount: number }): QuotePricingResult {
  if (discount < 0) {
    return deny('Discount must be zero or greater.');
  }

  if (discount > basePrice) {
    return deny('Discount cannot be greater than the product base price.');
  }

  return { allowed: true, reason: null };
}

export function computeQuoteTotal({
  deliveryIncluded = false,
  deliveryPrice = 0,
  discount,
  quotedBasePrice,
}: {
  deliveryIncluded?: boolean;
  deliveryPrice?: number;
  discount: number;
  quotedBasePrice: number;
}): number {
  return Math.max(0, quotedBasePrice - discount) + (deliveryIncluded ? deliveryPrice : 0);
}

function deny(reason: string): QuotePricingResult {
  return { allowed: false, reason };
}
