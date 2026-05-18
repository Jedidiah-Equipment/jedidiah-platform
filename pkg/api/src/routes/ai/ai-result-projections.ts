import { type AiLink, createAiLink } from './ai-link-metadata.js';
import type { AiToolName } from './ai-tools.js';

type LinkableRecord = Record<string, unknown> & {
  id: string;
};

export function projectAiToolResult(name: AiToolName, result: unknown): unknown {
  switch (name) {
    case 'getCustomer':
      return projectCustomer(result);
    case 'getJob':
      return projectJob(result);
    case 'getProduct':
      return projectProduct(result);
    case 'getQuote':
      return projectQuote(result);
    case 'listCustomers':
    case 'listQuoteCustomers':
      return projectPagedItems(result, projectCustomer);
    case 'listJobs':
      return projectPagedItems(result, projectJob);
    case 'listProducts':
    case 'listQuoteProducts':
      return projectPagedItems(result, projectProduct);
    case 'listQuotes':
      return projectPagedItems(result, projectQuote);
    case 'listQuoteSalespeople':
    case 'listUsers':
      return result;
    case 'listAuditEvents':
      return result;
  }
}

function projectPagedItems(result: unknown, projectItem: (item: unknown) => unknown): unknown {
  if (!isObjectRecord(result) || !Array.isArray(result.items)) {
    return result;
  }

  return {
    ...result,
    items: result.items.map(projectItem),
  };
}

function projectCustomer(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const label = typeof value.companyName === 'string' ? value.companyName : null;
  return addLinks(value, [label ? createAiLink('Customer', label, value.id) : null]);
}

function projectJob(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const label = typeof value.code === 'string' ? value.code : null;
  return addLinks(value, [
    label ? createAiLink('Job', label, value.id) : null,
    createLink('Quote', value.quoteCode, value.quoteId),
  ]);
}

function projectProduct(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const label = typeof value.name === 'string' ? value.name : null;
  return addLinks(value, [label ? createAiLink('Product', label, value.id) : null]);
}

function projectQuote(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const label = typeof value.code === 'string' ? value.code : null;
  return addLinks(value, [
    label ? createAiLink('Quote', label, value.id) : null,
    createLink('Customer', value.customerCompanyName, value.customerId),
    createLink('Product', value.productName, value.productId),
    createLink('Job', value.jobCode, value.jobId),
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

function isRecord(value: unknown): value is LinkableRecord {
  return isObjectRecord(value) && typeof value.id === 'string';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
