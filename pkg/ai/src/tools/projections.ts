import { type AiLink, createAiLink } from '../link-metadata.js';

type LinkableRecord = Record<string, unknown> & {
  id: string;
};

export function identityProjection(result: unknown): unknown {
  return result;
}

export function projectPagedItems(result: unknown, projectItem: (item: unknown) => unknown): unknown {
  if (!isObjectRecord(result) || !Array.isArray(result.items)) {
    return result;
  }

  return {
    ...result,
    items: result.items.map(projectItem),
  };
}

export function projectCustomer(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const label = typeof value.companyName === 'string' ? value.companyName : null;
  return addLinks(value, [label ? createAiLink('Customer', label, value.id) : null]);
}

export function projectJob(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const label = typeof value.code === 'string' ? value.code : null;
  return addLinks(value, [
    label ? createAiLink('Job', label, value.id) : null,
    createLink('Quote', value.quoteCode, value.quoteId),
    createLink('Customer', value.customerCompanyName, value.customerId),
  ]);
}

export function projectProduct(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const label = typeof value.name === 'string' ? value.name : null;
  return addLinks(value, [label ? createAiLink('Product', label, value.id) : null]);
}

export function projectQuote(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const { sentAt: _sentAt, ...projectedValue } = value;
  const label = typeof value.code === 'string' ? value.code : null;
  const product = isObjectRecord(value.product) ? value.product : null;
  const productLabel = typeof product?.name === 'string' ? product.name : null;
  return addLinks(projectedValue, [
    label ? createAiLink('Quote', label, value.id) : null,
    createLink('Customer', value.customerCompanyName, value.customerId),
    createLink('Product', productLabel, value.productId),
    createJobLink(value.job),
  ]);
}

function addLinks<T extends LinkableRecord>(value: T, links: readonly (AiLink | null)[]): T & { links?: AiLink[] } {
  const availableLinks = links.filter((link): link is AiLink => link !== null);

  if (availableLinks.length === 0) {
    return value;
  }

  return {
    ...value,
    links: availableLinks,
  };
}

function createLink(entity: AiLink['entity'], label: unknown, id: unknown): AiLink | null {
  if (typeof label !== 'string' || typeof id !== 'string') {
    return null;
  }

  return createAiLink(entity, label, id);
}

function createJobLink(value: unknown): AiLink | null {
  if (!isObjectRecord(value) || typeof value.jobCode !== 'string' || typeof value.jobId !== 'string') {
    return null;
  }

  return createAiLink('Job', value.jobCode, value.jobId);
}

function isRecord(value: unknown): value is LinkableRecord {
  return isObjectRecord(value) && typeof value.id === 'string';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
