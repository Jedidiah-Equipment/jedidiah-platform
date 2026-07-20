/**
 * The generated Product Brochure is not a stored document, so the document viewer
 * routes it with this stable sentinel id instead of a database document id.
 */
export const PRODUCT_BROCHURE_DOCUMENT_ID = 'brochure';

/** Filename used when viewing or saving a Product's generated Brochure. */
export function productBrochureFilename(modelCode: string): string {
  return `${modelCode}-brochure.pdf`;
}
