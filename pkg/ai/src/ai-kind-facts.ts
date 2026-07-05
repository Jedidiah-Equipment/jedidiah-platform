export const AI_QUOTE_KIND_PROMPT_LINES = [
  'For Quote questions, distinguish Product Quotes from Custom Quotes: Product Quotes have a Product and Selected Assemblies; Custom Quotes have a Work Title, entered base price, and no Product.',
  'Product Quotes keep their Product immutable after creation and latch quotedBasePrice plus quotedCurrencyCode from the Product; Custom Quotes use entered quotedBasePrice in ZAR.',
  'Quote totals include Quote Line Items as quantity x unit price on both kinds; Custom Quotes have zero Selected Assemblies.',
  'Product Quotes can create Product Jobs only once accepted; draft, sent, and accepted Custom Quotes can create Custom Jobs, and Custom Quotes lock commercial facts once accepted.',
] as const;

export const AI_QUOTE_TO_JOB_RELATIONSHIP =
  'A Quote sources at most one Job, and every Job is created from exactly one Quote. Product Jobs require an accepted Product Quote; Custom Jobs can come from draft, sent, or accepted Custom Quotes.';

export const AI_JOB_KIND_GUIDANCE = [
  'Product Jobs come from accepted Product Quotes and have Product Serial Number, Product display fields, CFO, and Product Document Snapshot facts.',
  'Custom Jobs come from Custom Quotes, use the Quote Work Title as the display name, and have no Product Serial Number, CFO, Product Document Snapshot, generated Brochure, or VIN requirement.',
  'Custom Job productName, productModelCode, and productSerialNumber are null; use Work Title as the display name fallback.',
] as const;

export const AI_QUOTE_KIND_GUIDANCE = [
  'Product Quote Status is editable until the Quote sources a Job; only accepted Product Quotes can create a Job.',
  'Draft, sent, and accepted Custom Quotes can create Custom Jobs; rejected and cancelled Custom Quotes cannot.',
  'Custom Quote commercial fields stay editable with a running Custom Job until the Quote is accepted, then lock on acceptance.',
  'Quote offerings are either kind=product with productId, or kind=custom with Work Title and entered base price.',
  'Quote Salesperson is required at creation; salesPersonId is non-nullable.',
  'Product Quote price snapshot fields are latched from Product at creation; Custom Quote base price is entered directly in ZAR.',
  'Quote Line Items are freeform charges on both Quote kinds and always add quantity x unit price to Quote Pricing.',
  'Custom Quotes have no Product and expose product as null, have zero Selected Assemblies, and use Work Title as the display name fallback.',
  'Quote commercial fields include Document Notes, Preferred Delivery Date, and Planned Delivery Date.',
] as const;

export const LIST_JOB_RESULT_IDENTIFIERS = [
  'Job Code',
  'Quote Kind',
  'Product serial number (null for Custom Jobs)',
  'Customer company name',
  'Product name and Product model code (null for Custom Jobs)',
  'Work Title display fallback for Custom Jobs',
  'scheduled Bay slots',
  'Quote Code',
] as const;

export const GET_JOB_RESULT_IDENTIFIERS = [
  'Job Code',
  'Quote Kind',
  'Product serial number (null for Custom Jobs)',
  'Quote Code',
  'Customer company name',
  'Product name and Product model code (null for Custom Jobs)',
  'Work Title display fallback for Custom Jobs',
  'scheduled Department and Bay slots',
  'Product Job CFO Part quantities with unitOfMeasure (empty for Custom Jobs)',
  'Job Documents (Custom Jobs start without Product Document Snapshots or generated Brochures)',
] as const;

const QUOTE_RESULT_IDENTIFIERS = [
  'Quote Code',
  'Quote Kind',
  'Quote Status',
  'Document Notes',
  'Preferred delivery date',
  'Planned delivery date',
  'Product UUID and nested product facts (name, modelCode, buildTimeDays, currencyCode) when this is a Product Quote; product is null for Custom Quotes or unresolved Product projections',
  'Work Title display fallback when this is a Custom Quote',
  'salesPersonId User ID',
  'quotedBasePrice and quotedCurrencyCode: latched from Product for Product Quotes; entered base price in ZAR for Custom Quotes',
  'Quote Line Items quantity x unit price contribution',
  'Selected Assemblies for Product Quotes; empty for Custom Quotes',
  'Customer company name',
  'linked Job Codes',
] as const;

export const LIST_QUOTE_RESULT_IDENTIFIERS = [...QUOTE_RESULT_IDENTIFIERS, 'linked Job UUIDs'] as const;

export const GET_QUOTE_RESULT_IDENTIFIERS = QUOTE_RESULT_IDENTIFIERS;

export const CREATE_QUOTE_RESULT_IDENTIFIERS = [
  'Quote Code',
  'Customer company name',
  'Quote Kind',
  'Custom Work Title',
  'Product name (null for Custom Quotes)',
  'quotedBasePrice: latched from Product for Product Quotes; entered base price for Custom Quotes',
  'quotedCurrencyCode',
  'Quote Line Items quantity x unit price contribution',
  'Selected Assemblies for Product Quotes; empty for Custom Quotes',
] as const;
