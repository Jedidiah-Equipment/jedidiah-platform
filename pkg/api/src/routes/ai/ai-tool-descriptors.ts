import { type AiLinkMetadata, aiLinkMetadata } from './ai-link-metadata.js';
import type { AiToolName } from './ai-tools.js';

export type AiToolDescriptor = {
  name: AiToolName;
  purpose: string;
  useWhen: readonly string[];
  doNotUseWhen: readonly string[];
  searchableIdentifiers: readonly string[];
  resultIdentifiers: readonly string[];
  linkTarget?: AiLinkMetadata;
};

export const aiToolDescriptors = {
  getCustomer: {
    name: 'getCustomer',
    purpose: 'Get one Customer by UUID.',
    useWhen: ['A Customer id is already known and the user needs that Customer record.'],
    doNotUseWhen: ['Searching by company name, email, or partial id; use listCustomers or listQuoteCustomers first.'],
    searchableIdentifiers: ['Customer UUID'],
    resultIdentifiers: ['Customer company name', 'Customer UUID'],
    linkTarget: aiLinkMetadata.Customer,
  },
  getJob: {
    name: 'getJob',
    purpose: 'Get one Job by UUID, including Stage summaries, visible Stage details, and workflow events.',
    useWhen: ['A Job id is already known and the user needs production progress or workflow history.'],
    doNotUseWhen: ['Searching by Job Code, numeric code, or partial id; use listJobs first.'],
    searchableIdentifiers: ['Job UUID'],
    resultIdentifiers: ['Job Code', 'Job Lifecycle Status', 'Due Date', 'Stage summaries', 'Workflow events'],
    linkTarget: aiLinkMetadata.Job,
  },
  getProduct: {
    name: 'getProduct',
    purpose: 'Get one Product by UUID.',
    useWhen: ['A Product id is already known and the user needs catalog details.'],
    doNotUseWhen: [
      'Searching by product name, model code, description, or partial id; use listProducts or listQuoteProducts first.',
    ],
    searchableIdentifiers: ['Product UUID'],
    resultIdentifiers: ['Product name', 'Product model code'],
    linkTarget: aiLinkMetadata.Product,
  },
  getQuote: {
    name: 'getQuote',
    purpose: 'Get one Quote by UUID.',
    useWhen: ['A Quote id is already known and the user needs Quote lifecycle or conversion details.'],
    doNotUseWhen: ['Searching by Quote Code, Customer, Product, linked Job Code, or partial id; use listQuotes first.'],
    searchableIdentifiers: ['Quote UUID'],
    resultIdentifiers: ['Quote Code', 'Quote Status', 'Customer company name', 'linked Job Code'],
    linkTarget: aiLinkMetadata.Quote,
  },
  listAuditEvents: {
    name: 'listAuditEvents',
    purpose: 'List targeted Audit Events.',
    useWhen: [
      'The user asks what changed, who changed it, or when a known entity was modified.',
      'Entity ids, entity types, actor ids, or date bounds can narrow the history.',
    ],
    doNotUseWhen: ['The user needs current entity state rather than forensic change history.'],
    searchableIdentifiers: ['entityIds', 'entityTypes', 'actorUserIds', 'occurredAtStart', 'occurredAtEnd'],
    resultIdentifiers: ['Audit Event summary', 'entity type', 'entity id', 'actor', 'occurred time'],
  },
  listCustomers: {
    name: 'listCustomers',
    purpose: 'List Customers visible to Customer readers.',
    useWhen: ['Searching by Customer company name, email, UUID, or partial text.'],
    doNotUseWhen: ['The caller only has quote access; use listQuoteCustomers for quote-reader Customer lookup.'],
    searchableIdentifiers: ['Customer UUID', 'company name', 'email'],
    resultIdentifiers: ['Customer company name', 'Customer UUID'],
    linkTarget: aiLinkMetadata.Customer,
  },
  listJobs: {
    name: 'listJobs',
    purpose: 'List Jobs visible to Job readers.',
    useWhen: ['Searching by Job Code, numeric code, Job UUID, partial UUID, or Job Lifecycle Status.'],
    doNotUseWhen: [
      'The user needs Stage detail or workflow history for one Job; call getJob after identifying the Job id.',
    ],
    searchableIdentifiers: ['Job UUID', 'Job Code such as JOB-00001', 'numeric Job Code', 'Job Lifecycle Status'],
    resultIdentifiers: ['Job Code', 'Job Lifecycle Status', 'Due Date', 'Stage summaries', 'Quote Code'],
    linkTarget: aiLinkMetadata.Job,
  },
  listProducts: {
    name: 'listProducts',
    purpose: 'List Products visible to Product readers.',
    useWhen: ['Searching by Product name, model code, description, UUID, or partial text.'],
    doNotUseWhen: ['The caller only has quote access; use listQuoteProducts for quote-reader Product lookup.'],
    searchableIdentifiers: ['Product UUID', 'Product name', 'model code', 'description'],
    resultIdentifiers: ['Product name', 'Product model code'],
    linkTarget: aiLinkMetadata.Product,
  },
  listQuoteCustomers: {
    name: 'listQuoteCustomers',
    purpose: 'List Customers available to Quote readers.',
    useWhen: ['A quote-reader needs to find a Customer by company name, email, UUID, or partial text.'],
    doNotUseWhen: ['The user needs Customer-only permissions or non-Quote Customer workflows.'],
    searchableIdentifiers: ['Customer UUID', 'company name', 'email'],
    resultIdentifiers: ['Customer company name', 'Customer UUID'],
    linkTarget: aiLinkMetadata.Customer,
  },
  listQuoteProducts: {
    name: 'listQuoteProducts',
    purpose: 'List Products available to Quote readers.',
    useWhen: ['A quote-reader needs to find a Product by name, model code, UUID, or partial text.'],
    doNotUseWhen: ['The user needs Product-only catalog workflows outside quoting.'],
    searchableIdentifiers: ['Product UUID', 'Product name', 'model code', 'description'],
    resultIdentifiers: ['Product name', 'Product model code'],
    linkTarget: aiLinkMetadata.Product,
  },
  listQuoteSalespeople: {
    name: 'listQuoteSalespeople',
    purpose: 'List Users who can be assigned as Quote Salespeople.',
    useWhen: ['The user needs the salesperson roster or needs to identify a salesperson id for a Quote follow-up.'],
    doNotUseWhen: ['Searching, sorting, or paging Users; this tool intentionally accepts no filters.'],
    searchableIdentifiers: ['none'],
    resultIdentifiers: ['User name', 'User email', 'User UUID'],
  },
  listQuotes: {
    name: 'listQuotes',
    purpose: 'List Quotes visible to Quote readers.',
    useWhen: [
      'Searching by Quote Code, Customer company name, Product name, Product model code, linked Job Code, UUID, or Quote Status.',
      'Traversing from Customer to Job through Quotes.',
    ],
    doNotUseWhen: ['The user needs full details for one Quote; call getQuote after identifying the Quote id.'],
    searchableIdentifiers: [
      'Quote UUID',
      'Quote Code such as QUO-00001',
      'Customer company name',
      'Product name',
      'linked Job Code',
      'Quote Status',
    ],
    resultIdentifiers: ['Quote Code', 'Quote Status', 'Customer company name', 'linked Job Code', 'linked Job UUID'],
    linkTarget: aiLinkMetadata.Quote,
  },
  listUsers: {
    name: 'listUsers',
    purpose: 'List all Users as safe summaries.',
    useWhen: ['The user needs the User roster or needs to identify a User id for a more specific follow-up query.'],
    doNotUseWhen: ['Searching, sorting, or paging Users; this tool intentionally accepts no filters.'],
    searchableIdentifiers: ['none'],
    resultIdentifiers: ['User name', 'User email', 'User UUID', 'App Role'],
  },
} satisfies Record<AiToolName, AiToolDescriptor>;

export function createToolDescription(descriptor: AiToolDescriptor): string {
  const lines = [
    descriptor.purpose,
    `Use when: ${descriptor.useWhen.join(' ')}`,
    `Do not use when: ${descriptor.doNotUseWhen.join(' ')}`,
    `Searchable identifiers: ${descriptor.searchableIdentifiers.join(', ')}.`,
    `Relevant result identifiers: ${descriptor.resultIdentifiers.join(', ')}.`,
  ];

  if (descriptor.linkTarget) {
    lines.push(
      `Link target: ${descriptor.linkTarget.entity} links use label ${descriptor.linkTarget.label} and href pattern ${descriptor.linkTarget.href}.`,
    );
  }

  return lines.join('\n');
}
