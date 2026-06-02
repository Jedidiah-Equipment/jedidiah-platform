import type { AiToolBase } from '@pkg/schema';

import type { AiContext } from './ai-context.js';
import { type AiLink, type AiLinkMetadata, aiLinkMetadata, createAiLink } from './ai-link-metadata.js';
import { getCustomerTool } from './tools/get-customer.js';
import { getJobTool } from './tools/get-job.js';
import { getPartTool } from './tools/get-part.js';
import { getProductTool } from './tools/get-product.js';
import { getQuoteTool } from './tools/get-quote.js';
import { listAuditEventsTool } from './tools/list-audit-events.js';
import { listCustomersTool } from './tools/list-customers.js';
import { listJobsTool } from './tools/list-jobs.js';
import { listPartsTool } from './tools/list-parts.js';
import { listProductsTool } from './tools/list-products.js';
import { listQuoteCustomersTool } from './tools/list-quote-customers.js';
import { listQuoteProductsTool } from './tools/list-quote-products.js';
import { listQuoteSalespeopleTool } from './tools/list-quote-salespeople.js';
import { listQuotesTool } from './tools/list-quotes.js';
import { listUsersTool } from './tools/list-users.js';

type LinkableRecord = Record<string, unknown> & {
  id: string;
};

type AiToolDescriptorInput = {
  purpose: string;
  useWhen: readonly string[];
  doNotUseWhen: readonly string[];
  searchableIdentifiers: readonly string[];
  resultIdentifiers: readonly string[];
  linkTarget?: AiLinkMetadata;
};

type AnyAiTool = AiToolBase<string, unknown, unknown, AiContext>;

type AiToolRegistryRecord<TTool extends AnyAiTool = AnyAiTool> = {
  tool: TTool;
  descriptor: AiToolDescriptorInput;
  projectResult: ProjectResult<TTool>;
};

type ProjectResult<TTool extends AnyAiTool> =
  TTool extends AiToolBase<string, infer TResult, unknown, AiContext> ? (result: TResult) => unknown : never;

type AiToolNames<TRegistry extends readonly AiToolRegistryRecord[]> = {
  readonly [Index in keyof TRegistry]: TRegistry[Index] extends AiToolRegistryRecord<infer TTool>
    ? TTool['name']
    : never;
};

export type AiToolDescriptor = AiToolDescriptorInput & {
  name: AiToolName;
};

export const AI_TOOL_REGISTRY = createAiToolRegistry([
  {
    tool: listProductsTool,
    descriptor: {
      purpose: 'List Products visible to Product readers.',
      useWhen: ['Searching by Product name, model code, description, UUID, or partial text.'],
      doNotUseWhen: ['The caller only has quote access; use listQuoteProducts for quote-reader Product lookup.'],
      searchableIdentifiers: ['Product UUID', 'Product name', 'model code', 'description'],
      resultIdentifiers: ['Product name', 'Product model code'],
      linkTarget: aiLinkMetadata.Product,
    },
    projectResult: (result) => projectPagedItems(result, projectProduct),
  },
  {
    tool: getProductTool,
    descriptor: {
      purpose: 'Get one Product by UUID.',
      useWhen: ['A Product id is already known and the user needs catalog details.'],
      doNotUseWhen: [
        'Searching by product name, model code, description, or partial id; use listProducts or listQuoteProducts first.',
      ],
      searchableIdentifiers: ['Product UUID'],
      resultIdentifiers: ['Product name', 'Product model code'],
      linkTarget: aiLinkMetadata.Product,
    },
    projectResult: projectProduct,
  },
  {
    tool: listPartsTool,
    descriptor: {
      purpose: 'List Parts visible to Part readers.',
      useWhen: [
        'Searching by Part code, name, category, supplier, unit of measure, internal fabrication flag, UUID, or partial text.',
      ],
      doNotUseWhen: ['A Part id is already known and the user needs one Part record; use getPart instead.'],
      searchableIdentifiers: [
        'Part UUID',
        'Part code',
        'Part name',
        'Part category',
        'isInternallyFabricated',
        'supplier name',
        'supplier code',
        'unitOfMeasure',
      ],
      resultIdentifiers: ['Part code', 'Part name', 'Supplier company name', 'unitOfMeasure', 'isInternallyFabricated'],
    },
    projectResult: identityProjection,
  },
  {
    tool: getPartTool,
    descriptor: {
      purpose: 'Get one Part by UUID, including its Supplier, unitOfMeasure, and isInternallyFabricated.',
      useWhen: [
        'A Part id is already known and the user needs the Part unit, internal fabrication flag, Supplier, or details.',
      ],
      doNotUseWhen: ['Searching by Part code, name, category, supplier, or partial id; use listParts first.'],
      searchableIdentifiers: ['Part UUID'],
      resultIdentifiers: ['Part code', 'Part name', 'Supplier company name', 'unitOfMeasure', 'isInternallyFabricated'],
    },
    projectResult: identityProjection,
  },
  {
    tool: listCustomersTool,
    descriptor: {
      purpose: 'List Customers visible to Customer readers.',
      useWhen: ['Searching by Customer company name, email, VAT number, UUID, or partial text.'],
      doNotUseWhen: ['The caller only has quote access; use listQuoteCustomers for quote-reader Customer lookup.'],
      searchableIdentifiers: ['Customer UUID', 'company name', 'email', 'VAT number'],
      resultIdentifiers: ['Customer company name', 'Customer UUID', 'VAT number'],
      linkTarget: aiLinkMetadata.Customer,
    },
    projectResult: (result) => projectPagedItems(result, projectCustomer),
  },
  {
    tool: getCustomerTool,
    descriptor: {
      purpose: 'Get one Customer by UUID.',
      useWhen: ['A Customer id is already known and the user needs that Customer record.'],
      doNotUseWhen: ['Searching by company name, email, or partial id; use listCustomers or listQuoteCustomers first.'],
      searchableIdentifiers: ['Customer UUID'],
      resultIdentifiers: ['Customer company name', 'Customer UUID', 'VAT number'],
      linkTarget: aiLinkMetadata.Customer,
    },
    projectResult: projectCustomer,
  },
  {
    tool: listJobsTool,
    descriptor: {
      purpose: 'List Jobs visible to Job readers.',
      useWhen: ['Searching by Job Code, product serial number, numeric code, Job UUID, partial UUID, or Job Status.'],
      doNotUseWhen: [
        'The user needs Stage detail or workflow history for one Job; call getJob after identifying the Job id.',
      ],
      searchableIdentifiers: [
        'Job UUID',
        'Job Code such as JOB-00001',
        'Product serial number such as SG1836260009',
        'numeric Job Code',
        'Job Status',
      ],
      resultIdentifiers: [
        'Job Code',
        'Product serial number',
        'Job Status',
        'Due Date',
        'Stage summaries',
        'Quote Code',
      ],
      linkTarget: aiLinkMetadata.Job,
    },
    projectResult: (result) => projectPagedItems(result, projectJob),
  },
  {
    tool: getJobTool,
    descriptor: {
      purpose: 'Get one Job by UUID, including Stage summaries, visible Stage details, and workflow events.',
      useWhen: ['A Job id is already known and the user needs production progress or workflow history.'],
      doNotUseWhen: ['Searching by Job Code, product serial number, numeric code, or partial id; use listJobs first.'],
      searchableIdentifiers: ['Job UUID'],
      resultIdentifiers: [
        'Job Code',
        'Job Status',
        'Due Date',
        'Stage summaries',
        'Workflow events',
        'CFO Part quantities with unitOfMeasure',
      ],
      linkTarget: aiLinkMetadata.Job,
    },
    projectResult: projectJob,
  },
  {
    tool: listQuotesTool,
    descriptor: {
      purpose: 'List Quotes visible to Quote readers.',
      useWhen: [
        'Searching by Quote Code, Customer company name, Product name, Product model code, linked Job Codes, UUID, or Quote Status.',
        'Traversing from Customer to Job through Quotes.',
      ],
      doNotUseWhen: ['The user needs full details for one Quote; call getQuote after identifying the Quote id.'],
      searchableIdentifiers: [
        'Quote UUID',
        'Quote Code such as QUO-00001',
        'Customer company name',
        'Product name',
        'linked Job Codes',
        'Quote Status',
      ],
      resultIdentifiers: [
        'Quote Code',
        'Quote Status',
        'Payment Terms',
        'Preferred delivery date',
        'Planned delivery date',
        'Product UUID',
        'salesPersonId User ID',
        'quotedBasePrice',
        'quotedCurrencyCode',
        'Customer company name',
        'linked Job Codes',
        'linked Job UUIDs',
      ],
      linkTarget: aiLinkMetadata.Quote,
    },
    projectResult: (result) => projectPagedItems(result, projectQuote),
  },
  {
    tool: getQuoteTool,
    descriptor: {
      purpose: 'Get one Quote by UUID.',
      useWhen: ['A Quote id is already known and the user needs Quote commercial details or linked Job details.'],
      doNotUseWhen: [
        'Searching by Quote Code, Customer, Product, linked Job Codes, or partial id; use listQuotes first.',
      ],
      searchableIdentifiers: ['Quote UUID'],
      resultIdentifiers: [
        'Quote Code',
        'Quote Status',
        'Payment Terms',
        'Preferred delivery date',
        'Planned delivery date',
        'Product UUID',
        'salesPersonId User ID',
        'quotedBasePrice',
        'quotedCurrencyCode',
        'Customer company name',
        'linked Job Codes',
      ],
      linkTarget: aiLinkMetadata.Quote,
    },
    projectResult: projectQuote,
  },
  {
    tool: listQuoteCustomersTool,
    descriptor: {
      purpose: 'List Customers available to Quote readers.',
      useWhen: ['A quote-reader needs to find a Customer by company name, email, VAT number, UUID, or partial text.'],
      doNotUseWhen: ['The user needs Customer-only permissions or non-Quote Customer workflows.'],
      searchableIdentifiers: ['Customer UUID', 'company name', 'email', 'VAT number'],
      resultIdentifiers: ['Customer company name', 'Customer UUID', 'VAT number'],
      linkTarget: aiLinkMetadata.Customer,
    },
    projectResult: (result) => projectPagedItems(result, projectCustomer),
  },
  {
    tool: listQuoteProductsTool,
    descriptor: {
      purpose: 'List Products available to Quote readers.',
      useWhen: ['A quote-reader needs to find a Product by name, model code, UUID, or partial text.'],
      doNotUseWhen: ['The user needs Product-only catalog workflows outside quoting.'],
      searchableIdentifiers: ['Product UUID', 'Product name', 'model code', 'description'],
      resultIdentifiers: ['Product name', 'Product model code'],
      linkTarget: aiLinkMetadata.Product,
    },
    projectResult: (result) => projectPagedItems(result, projectProduct),
  },
  {
    tool: listQuoteSalespeopleTool,
    descriptor: {
      purpose: 'List Users who can be assigned as Quote Salespeople.',
      useWhen: ['The user needs the salesperson roster or needs to identify a salesperson id for a Quote follow-up.'],
      doNotUseWhen: ['Searching, sorting, or paging Users; this tool intentionally accepts no filters.'],
      searchableIdentifiers: ['none'],
      resultIdentifiers: ['User name', 'User email', 'User UUID'],
    },
    projectResult: identityProjection,
  },
  {
    tool: listAuditEventsTool,
    descriptor: {
      purpose: 'List targeted Audit Events.',
      useWhen: [
        'The user asks what changed, who changed it, or when a known entity was modified.',
        'Entity ids, entity types, actor ids, or date bounds can narrow the history.',
      ],
      doNotUseWhen: ['The user needs current entity state rather than forensic change history.'],
      searchableIdentifiers: ['entityIds', 'entityTypes', 'actorUserIds', 'occurredAtStart', 'occurredAtEnd'],
      resultIdentifiers: ['Audit Event summary', 'entity type', 'entity id', 'actor', 'occurred time'],
    },
    projectResult: identityProjection,
  },
  {
    tool: listUsersTool,
    descriptor: {
      purpose: 'List all Users as safe summaries.',
      useWhen: ['The user needs the User roster or needs to identify a User id for a more specific follow-up query.'],
      doNotUseWhen: ['Searching, sorting, or paging Users; this tool intentionally accepts no filters.'],
      searchableIdentifiers: ['none'],
      resultIdentifiers: ['User name', 'User email', 'User UUID', 'App Role'],
    },
    projectResult: identityProjection,
  },
]);

export type AiTool = (typeof AI_TOOL_REGISTRY)[number]['tool'];
export type AiToolName = (typeof AI_TOOL_REGISTRY)[number]['tool']['name'];
export type RegisteredAiTool<TTool extends AnyAiTool = AiTool> = TTool & {
  description: string;
};
export type AiToolMap = {
  [Name in AiToolName]: RegisteredAiTool<Extract<AiTool, { name: Name }>>;
};

export const AI_TOOL_NAMES = AI_TOOL_REGISTRY.map((record) => record.tool.name) as unknown as AiToolNames<
  typeof AI_TOOL_REGISTRY
>;
export const aiToolDescriptors = createAiToolDescriptorMap(AI_TOOL_REGISTRY);
export const aiTools = createAiToolMap(AI_TOOL_REGISTRY, aiToolDescriptors);

const aiToolResultProjectors = createAiToolResultProjectorMap(AI_TOOL_REGISTRY);

export function projectAiToolResult(name: AiToolName, result: unknown): unknown {
  return aiToolResultProjectors[name](result);
}

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

function createAiToolRegistry<const TRegistry extends readonly AiToolRegistryRecord[]>(records: TRegistry): TRegistry {
  return records;
}

function createAiToolDescriptorMap<const TRegistry extends readonly AiToolRegistryRecord[]>(
  records: TRegistry,
): Record<AiToolName, AiToolDescriptor> {
  const descriptors = {} as Record<AiToolName, AiToolDescriptor>;

  for (const record of records) {
    const name = record.tool.name as AiToolName;
    descriptors[name] = {
      ...record.descriptor,
      name,
    };
  }

  return descriptors;
}

function createAiToolMap<const TRegistry extends readonly AiToolRegistryRecord[]>(
  records: TRegistry,
  descriptors: Record<AiToolName, AiToolDescriptor>,
): AiToolMap {
  const tools = {} as Record<AiToolName, RegisteredAiTool>;

  for (const record of records) {
    const name = record.tool.name as AiToolName;
    tools[name] = {
      ...record.tool,
      description: createToolDescription(descriptors[name]),
    } as RegisteredAiTool;
  }

  return tools as AiToolMap;
}

function createAiToolResultProjectorMap<const TRegistry extends readonly AiToolRegistryRecord[]>(
  records: TRegistry,
): Record<AiToolName, (result: unknown) => unknown> {
  const projectors = {} as Record<AiToolName, (result: unknown) => unknown>;

  for (const record of records) {
    projectors[record.tool.name as AiToolName] = record.projectResult;
  }

  return projectors;
}

function identityProjection(result: unknown): unknown {
  return result;
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

  const { sentAt: _sentAt, ...projectedValue } = value;
  const label = typeof value.code === 'string' ? value.code : null;
  return addLinks(projectedValue, [
    label ? createAiLink('Quote', label, value.id) : null,
    createLink('Customer', value.customerCompanyName, value.customerId),
    createLink('Product', value.productName, value.productId),
    ...createLinkedJobLinks(value.linkedJobs),
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

function createLinkedJobLinks(value: unknown): AiLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) =>
      isObjectRecord(item) && typeof item.jobCode === 'string' && typeof item.jobId === 'string'
        ? createAiLink('Job', item.jobCode, item.jobId)
        : null,
    )
    .filter((link): link is AiLink => link !== null);
}

function isRecord(value: unknown): value is LinkableRecord {
  return isObjectRecord(value) && typeof value.id === 'string';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
