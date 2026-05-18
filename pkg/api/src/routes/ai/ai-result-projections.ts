import type { AiToolName } from './ai-tools.js';

type AssistantLink = {
  entity: 'Customer' | 'Job' | 'Product' | 'Quote';
  href: string;
  label: string;
};

type LinkableRecord = Record<string, unknown> & {
  id?: unknown;
};

export type AiProjectedResult = unknown;

export function projectAiToolResult(name: AiToolName, result: unknown): AiProjectedResult {
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
  return addAssistantLink(value, label ? createLink('Customer', label, `/customers/${value.id}/edit`) : null);
}

function projectJob(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const label = typeof value.code === 'string' ? value.code : null;
  const projected = addAssistantLink(value, label ? createLink('Job', label, `/jobs/${value.id}`) : null);

  if (typeof value.quoteCode === 'string' && typeof value.quoteId === 'string') {
    return {
      ...projected,
      quoteLink: createLink('Quote', value.quoteCode, `/quotes/${value.quoteId}`),
    };
  }

  return projected;
}

function projectProduct(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const label = typeof value.name === 'string' ? value.name : null;
  return addAssistantLink(value, label ? createLink('Product', label, `/products/${value.id}/edit`) : null);
}

function projectQuote(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const label = typeof value.code === 'string' ? value.code : null;
  const projected = addAssistantLink(value, label ? createLink('Quote', label, `/quotes/${value.id}`) : null);

  if (typeof value.jobCode === 'string' && typeof value.jobId === 'string') {
    return {
      ...projected,
      jobLink: createLink('Job', value.jobCode, `/jobs/${value.jobId}`),
    };
  }

  return projected;
}

function addAssistantLink<T extends LinkableRecord>(
  value: T,
  link: AssistantLink | null,
): T & { assistantLink?: AssistantLink } {
  if (!link) {
    return value;
  }

  return {
    ...value,
    assistantLink: link,
  };
}

function createLink(entity: AssistantLink['entity'], label: string, href: string): AssistantLink {
  return {
    entity,
    href,
    label,
  };
}

function isRecord(value: unknown): value is LinkableRecord {
  return isObjectRecord(value) && typeof value.id === 'string';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
