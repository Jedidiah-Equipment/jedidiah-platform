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
      'Product Quote Status is editable until the Quote sources a Job; only accepted Product Quotes can create a Job.',
      'Custom Quotes do not create Jobs yet and their commercial fields lock once the Quote is accepted.',
      'Quote offerings are either kind=product with productId, or kind=custom with workTitle and entered basePrice.',
      'Quote Salesperson is required at creation; salesPersonId is non-nullable.',
      'Product Quote price snapshot fields are latched from Product at creation; Custom Quote base price is entered directly.',
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
