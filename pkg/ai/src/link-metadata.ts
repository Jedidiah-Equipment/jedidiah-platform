import { AI_JOB_KIND_GUIDANCE, AI_QUOTE_KIND_GUIDANCE } from './kind-facts.js';

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
    guidance: AI_JOB_KIND_GUIDANCE,
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
    guidance: AI_QUOTE_KIND_GUIDANCE,
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
