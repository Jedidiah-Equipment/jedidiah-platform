import { UUID } from '@pkg/schema';
import { type QuoteOfferingInput, type QuoteOfferingType, QuoteWorkTitle } from '@pkg/schema/equipment';
import type { z } from 'zod';

/** Pre-filled when a new Quote becomes a Parts Sale with no Work Title yet; the user can change it. */
export const PARTS_SALE_DEFAULT_WORK_TITLE = 'Parts sale';

/** The create form's offering fields, in browser shape: empty strings stand in for nothing chosen. */
export type QuoteOfferingFormFields = {
  productId: string;
  productUnitId?: string;
  workTitle: string;
};

/**
 * The inverse of `quoteOfferingType`: the create form's three-way choice back onto the wire offering.
 * Returns the pre-parse shape so `QuoteCreateInput.parse` still applies the create-time defaults.
 */
export function toQuoteOfferingInput(
  offeringType: QuoteOfferingType,
  fields: QuoteOfferingFormFields,
): z.input<typeof QuoteOfferingInput> {
  return offeringType === 'product'
    ? { kind: 'product', productId: fields.productId, productUnitId: fields.productUnitId || null }
    : { isPartsSale: offeringType === 'parts-sale', kind: 'custom', workTitle: fields.workTitle };
}

/** A Parts Sale with no Work Title yet starts from the default; anything already typed is kept. */
export function partsSaleWorkTitle(offeringType: QuoteOfferingType, workTitle: string): string {
  return offeringType === 'parts-sale' && !workTitle.trim() ? PARTS_SALE_DEFAULT_WORK_TITLE : workTitle;
}

export type QuoteOfferingFieldError = { message: string; path: 'productId' | 'workTitle' };

/** A Product offering needs a Product; every other offering needs a Work Title. */
export function quoteOfferingFieldError(
  offeringType: QuoteOfferingType,
  fields: Pick<QuoteOfferingFormFields, 'productId' | 'workTitle'>,
): QuoteOfferingFieldError | null {
  if (offeringType === 'product') {
    return UUID.safeParse(fields.productId).success ? null : { message: 'Select a product', path: 'productId' };
  }

  return QuoteWorkTitle.safeParse(fields.workTitle).success
    ? null
    : { message: 'Work title is required', path: 'workTitle' };
}
