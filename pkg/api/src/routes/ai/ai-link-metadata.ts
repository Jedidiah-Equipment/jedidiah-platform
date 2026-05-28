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
      'Quote Status is a cosmetic label with no transition rules, side effects, or creation gates; it is freely editable and used for display, filtering, and sorting.',
      'Quote Product is required at creation and immutable post-creation; productId is non-nullable.',
      'Quote Salesperson is required at creation; salesPersonId is non-nullable.',
      'Quote price snapshot fields quotedBasePrice and quotedCurrencyCode are latched from Product at creation.',
      'Quote commercial fields include Payment Terms, Preferred Delivery Date, and Planned Delivery Date.',
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
