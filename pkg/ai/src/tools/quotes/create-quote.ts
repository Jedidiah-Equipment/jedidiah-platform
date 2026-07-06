import * as core from '@pkg/core';
import {
  type AiToolBase,
  AuthId,
  DateIsoString,
  DateOnlyIsoString,
  Price,
  type QuoteCreateInput,
  QuoteCreateInput as QuoteCreateInputSchema,
  type QuoteDetail,
  QuoteWorkTitle,
  requiredTrimmedText,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { requireActorSession } from '../actor.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectQuote } from '../projections.js';

const CreateQuoteCustomerInput = z
  .object({
    address: z.string().nullable().optional(),
    companyName: requiredTrimmedText('Company name is required').optional(),
    contactPerson: z.string().nullable().optional(),
    customerId: UUID.optional(),
    email: z.email().nullable().optional(),
    phone: z.string().nullable().optional(),
    type: z.enum(['existing', 'inline']),
  })
  .strict()
  .describe(
    'Quote Customer: existing requires customerId; inline creates a new Customer from companyName plus any contactPerson, email, phone, or address the user mentioned.',
  );

const CreateQuoteOfferingInput = z
  .object({
    basePrice: z.coerce.number().pipe(Price).optional(),
    kind: z.enum(['product', 'custom']),
    productId: UUID.optional(),
    workTitle: QuoteWorkTitle.optional(),
  })
  .strict();

const CreateQuoteSelectedAssemblyInput = z
  .object({
    id: UUID.optional(),
    productAssemblyId: UUID.optional(),
    type: z.enum(['existing', 'catalog']),
  })
  .strict();

const CreateQuoteInput = QuoteCreateInputSchema.omit({
  customer: true,
  documentNotes: true,
  notes: true,
  offering: true,
  plannedDeliveryDate: true,
  preferredDeliveryDate: true,
  salesPersonId: true,
  selectedAssemblies: true,
  status: true,
  validUntil: true,
})
  .extend({
    customer: CreateQuoteCustomerInput,
    documentNotes: QuoteCreateInputSchema.shape.documentNotes.optional(),
    notes: QuoteCreateInputSchema.shape.notes.optional(),
    offering: CreateQuoteOfferingInput,
    plannedDeliveryDate: DateOnlyIsoString.nullable().default(null),
    preferredDeliveryDate: DateOnlyIsoString.nullable().default(null),
    salesPersonId: AuthId.optional().describe(
      'Salesperson User ID. Optional: when omitted the Quote is assigned to the acting user (the person making this request). Only set this when the user explicitly asks to assign the Quote to a different salesperson; do not pick one from the roster otherwise.',
    ),
    selectedAssemblies: z.array(CreateQuoteSelectedAssemblyInput).default([]),
    status: QuoteCreateInputSchema.shape.status.default('draft'),
    validUntil: DateIsoString.nullable().default(null),
  })
  .strict();

type CreateQuoteInput = z.infer<typeof CreateQuoteInput>;

export type CreateQuoteTool = AiToolBase<'createQuote', QuoteDetail, CreateQuoteInput, AiContext>;

export const createQuoteTool: CreateQuoteTool = {
  name: 'createQuote',
  inputSchema: CreateQuoteInput,
  jsonSchema: toAiToolJsonSchema(CreateQuoteInput, { io: 'input' }),
  requiredPermission: 'quote:create',
  async handler(args: unknown, ctx: AiContext) {
    const parsedInput = CreateQuoteInput.parse(args);
    const actorUserId = requireActorSession(ctx).user.id;
    const input: QuoteCreateInput = QuoteCreateInputSchema.parse({
      ...parsedInput,
      documentNotes: parsedInput.documentNotes ?? null,
      notes: parsedInput.notes ?? null,
      salesPersonId: parsedInput.salesPersonId ?? actorUserId,
    });

    return core.createQuote({ actorUserId, db: ctx.db, input });
  },
};

export const createQuoteDefinition: AiToolDefinition<CreateQuoteTool> = {
  kind: 'write',
  tool: createQuoteTool,
  descriptor: {
    purpose: 'Create one Product Quote or Custom Quote.',
    useWhen: [
      'The user explicitly asks to create a Product Quote for a Product, or a Custom Quote with a Work Title and entered base price.',
    ],
    doNotUseWhen: [
      'The user only needs to search or inspect Quotes; use listQuotes or getQuote.',
      'The user asks for standalone Customer creation; use createCustomer only when customer:create is available.',
    ],
    searchableIdentifiers: [
      'Customer UUID or inline companyName with optional contactPerson, email, phone, address',
      'offering.kind product or custom',
      'Product UUID for Product Quotes',
      'Custom Work Title for Custom Quotes',
      'salesPersonId User ID (optional; defaults to the acting user, set only to assign a different salesperson)',
    ],
    resultIdentifiers: [
      'Quote Code',
      'Customer company name',
      'Quote Kind',
      'Custom Work Title',
      'Product name (null for Custom Quotes)',
      'quotedBasePrice: latched from Product for Product Quotes; entered base price for Custom Quotes',
      'quotedCurrencyCode',
      'Quote Line Items quantity x unit price contribution',
      'Selected Assemblies for Product Quotes; empty for Custom Quotes',
    ],
    linkTarget: aiLinkMetadata.Quote,
  },
  projectResult: projectQuote,
};
