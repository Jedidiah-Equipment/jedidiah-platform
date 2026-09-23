/** The offering facts that name a Quote's type; only a Custom offering can be a Parts Sale. */
export type QuoteOfferingFacts = { kind: 'product' } | { isPartsSale: boolean; kind: 'custom' };
