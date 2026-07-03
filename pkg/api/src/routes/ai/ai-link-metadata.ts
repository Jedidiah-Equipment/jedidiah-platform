export type AiLinkEntity = 'Customer' | 'Job' | 'Product' | 'Quote';

export type AiLinkMetadata = {
  entity: AiLinkEntity;
  href: string;
  label: string;
  guidance?: readonly string[];
};

export type AiLink = {
  entity: AiLinkEntity;
  href: string;
  label: string;
};

export const aiLinkMetadata = {
  Customer: {
    entity: 'Customer',
    href: '/customers/{id}/edit',
    label: 'companyName',
  },
  Job: {
    entity: 'Job',
    guidance: [
      'Product Jobs come from accepted Product Quotes and have Product Serial Number, Product display fields, CFO, and Product Document Snapshot facts.',
      'Custom Jobs come from Custom Quotes, use the Quote Work Title as the display name, and have no Product Serial Number, CFO, Product Document Snapshot, generated Brochure, or VIN requirement.',
      'Custom Job productName, productModelCode, and productSerialNumber are null; use Work Title as the display name fallback.',
    ],
    href: '/jobs/{id}',
    label: 'code',
  },
  Product: {
    entity: 'Product',
    href: '/products/{id}/edit',
    label: 'name',
  },
  Quote: {
    entity: 'Quote',
    href: '/quotes/{id}',
    guidance: [
      'Product Quote Status is editable until the Quote sources a Job; only accepted Product Quotes can create a Job.',
      'Draft, sent, and accepted Custom Quotes can create Custom Jobs; rejected and cancelled Custom Quotes cannot.',
      'Custom Quote commercial fields stay editable with a running Custom Job until the Quote is accepted, then lock on acceptance.',
      'Quote offerings are either kind=product with productId, or kind=custom with Work Title and entered base price.',
      'Quote Salesperson is required at creation; salesPersonId is non-nullable.',
      'Product Quote price snapshot fields are latched from Product at creation; Custom Quote base price is entered directly in ZAR.',
      'Quote Line Items are freeform charges on both Quote kinds and always add quantity x unit price to Quote Pricing.',
      'Custom Quotes have no Product, productName, or productModelCode, and have zero Selected Assemblies; use Work Title as the display name fallback.',
      'Quote commercial fields include Document Notes, Preferred Delivery Date, and Planned Delivery Date.',
    ],
    label: 'code',
  },
} as const satisfies Record<AiLinkEntity, AiLinkMetadata>;

export function createAiLink(entity: AiLinkEntity, label: string, id: string): AiLink {
  const metadata = aiLinkMetadata[entity];

  return {
    entity,
    href: metadata.href.replace('{id}', id),
    label,
  };
}
