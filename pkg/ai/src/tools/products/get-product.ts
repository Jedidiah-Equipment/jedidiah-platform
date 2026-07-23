import * as productsCore from '@pkg/core';
import { createProductAppHref, InternalAppHref, Product, UUID } from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';

import { ProductBayResponse } from './product-bay-response.js';

export type GetProductInput = z.infer<typeof GetProductInput>;
export const GetProductInput = z.object({ id: UUID }).strict();

export type GetProductResponse = z.infer<typeof GetProductResponse>;
export const GetProductResponse = Product.pick({
  assemblies: true,
  basePrice: true,
  brochureEnabled: true,
  buildTimeDays: true,
  category: true,
  createdAt: true,
  currencyCode: true,
  description: true,
  id: true,
  images: true,
  keyFeatures: true,
  landerEnabled: true,
  modelCode: true,
  name: true,
  nameHighlight: true,
  range: true,
  requiresVinNumber: true,
  technicalDetails: true,
  updatedAt: true,
  variant: true,
}).extend({
  links: z.object({ app: InternalAppHref }),
  productBays: z.array(ProductBayResponse),
});

export function toGetProductResponse(product: Product): GetProductResponse {
  return GetProductResponse.parse({
    assemblies: product.assemblies,
    basePrice: product.basePrice,
    brochureEnabled: product.brochureEnabled,
    buildTimeDays: product.buildTimeDays,
    category: product.category,
    createdAt: product.createdAt,
    currencyCode: product.currencyCode,
    description: product.description,
    id: product.id,
    images: product.images,
    keyFeatures: product.keyFeatures,
    landerEnabled: product.landerEnabled,
    links: { app: createProductAppHref(product.id) },
    modelCode: product.modelCode,
    name: product.name,
    nameHighlight: product.nameHighlight,
    productBays: product.productBays.map((productBay) => ({
      bay: {
        department: productBay.bay.department,
        id: productBay.bay.id,
        name: productBay.bay.name,
      },
      defaultWorkingDays: productBay.defaultWorkingDays,
    })),
    range: product.range,
    requiresVinNumber: product.requiresVinNumber,
    technicalDetails: product.technicalDetails,
    updatedAt: product.updatedAt,
    variant: product.variant,
  });
}

export const getProductDefinition = {
  name: 'getProduct',
  description: [
    'Get the full details for one Product by UUID.',
    'Use after findProducts identifies the Product the user means.',
    'Returns commercial, marketing, configuration, bay, assembly, image metadata, and app-link details.',
  ].join('\n'),
  inputSchema: GetProductInput,
  outputSchema: GetProductResponse,
  anyOfPermissions: ['product:read'],
  async handler(args: unknown, ctx: AiContext): Promise<GetProductResponse> {
    const input = GetProductInput.parse(args);
    const product = await productsCore.getProduct({ db: ctx.db, id: input.id });
    return toGetProductResponse(product);
  },
} as const;
