import { z } from 'zod';
import { DateIso } from '../common/date.js';
import { createSearchedSortedPagedQueryInput, createSortedPagedQueryResult } from '../common/pagination.js';
import { Price } from '../common/price.js';
import { nullableTrimmedText, nullableTrimmedTextInput, requiredTrimmedText } from '../common/text.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { UUID } from '../common/uuid.js';

export type ProductName = z.infer<typeof ProductName>;
export const ProductName = requiredTrimmedText('Product name is required');

export type ProductModelCode = z.infer<typeof ProductModelCode>;
export const ProductModelCode = requiredTrimmedText('Model code is required');

export type ProductDescription = z.infer<typeof ProductDescription>;
export const ProductDescription = nullableTrimmedText();

export type ProductDescriptionInput = z.infer<typeof ProductDescriptionInput>;
export const ProductDescriptionInput = nullableTrimmedTextInput();

export type ProductBasePrice = z.infer<typeof ProductBasePrice>;
export const ProductBasePrice = z.coerce.number().pipe(Price);

export type ProductBuildTimeDays = z.infer<typeof ProductBuildTimeDays>;
export const ProductBuildTimeDays = z
  .number()
  .int('Build time must be a whole number')
  .min(0, 'Must be zero or greater');

export type ProductBuildTimeDaysInput = z.infer<typeof ProductBuildTimeDaysInput>;
export const ProductBuildTimeDaysInput = z.coerce.number().pipe(ProductBuildTimeDays);

export type ProductCurrencyCode = z.infer<typeof ProductCurrencyCode>;
export const ProductCurrencyCode = z.literal('ZAR').default('ZAR');

export type AssemblyKind = z.infer<typeof AssemblyKind>;
export const AssemblyKind = z.enum(['standard', 'optional']);

export type AssemblyName = z.infer<typeof AssemblyName>;
export const AssemblyName = requiredTrimmedText('Assembly name is required');

export type AssemblyPartQuantity = z.infer<typeof AssemblyPartQuantity>;
export const AssemblyPartQuantity = z
  .number()
  .int('Quantity must be a whole number')
  .min(1, 'Quantity must be at least 1');

export type AssemblyPartQuantityInput = z.infer<typeof AssemblyPartQuantityInput>;
export const AssemblyPartQuantityInput = z.coerce.number().pipe(AssemblyPartQuantity);

export type AssemblyPart = z.infer<typeof AssemblyPart>;
export const AssemblyPart = z.object({
  partId: UUID,
  quantity: AssemblyPartQuantity,
});

export type StandardAssembly = z.infer<typeof StandardAssembly>;
export const StandardAssembly = z.object({
  id: UUID,
  productId: UUID,
  kind: z.literal('standard'),
  name: AssemblyName,
  parts: z.array(AssemblyPart),
});

export type OptionalAssembly = z.infer<typeof OptionalAssembly>;
export const OptionalAssembly = z.object({
  id: UUID,
  productId: UUID,
  kind: z.literal('optional'),
  name: AssemblyName,
  price: ProductBasePrice,
  parts: z.array(AssemblyPart),
  overrideStandardAssemblyIds: z.array(UUID),
});

export type Assembly = z.infer<typeof Assembly>;
export const Assembly = z.discriminatedUnion('kind', [StandardAssembly, OptionalAssembly]);

export type StandardAssemblyInput = z.infer<typeof StandardAssemblyInput>;
export const StandardAssemblyInput = z.object({
  id: UUID.optional(),
  kind: z.literal('standard'),
  name: AssemblyName,
  parts: z.array(AssemblyPart),
});

export type OptionalAssemblyInput = z.infer<typeof OptionalAssemblyInput>;
export const OptionalAssemblyInput = z.object({
  id: UUID.optional(),
  kind: z.literal('optional'),
  name: AssemblyName,
  price: ProductBasePrice,
  parts: z.array(AssemblyPart),
  overrideStandardAssemblyIds: z.array(UUID).default([]),
});

export type AssemblyInput = z.infer<typeof AssemblyInput>;
export const AssemblyInput = z.discriminatedUnion('kind', [StandardAssemblyInput, OptionalAssemblyInput]);

export function refineProductAssemblies(assemblies: AssemblyInput[], ctx: z.RefinementCtx): void {
  const assemblyNames = new Map<string, number>();
  const standardIds = new Set<string>();

  assemblies.forEach((assembly, assemblyIndex) => {
    const normalizedName = assembly.name.trim().toLowerCase();
    const duplicateNameIndex = assemblyNames.get(normalizedName);

    if (duplicateNameIndex !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Assembly names must be unique within a product',
        path: [assemblyIndex, 'name'],
      });
      ctx.addIssue({
        code: 'custom',
        message: 'Assembly names must be unique within a product',
        path: [duplicateNameIndex, 'name'],
      });
    } else {
      assemblyNames.set(normalizedName, assemblyIndex);
    }

    if (assembly.kind === 'standard' && assembly.id) {
      standardIds.add(assembly.id);
    }

    const partIds = new Map<string, number>();
    assembly.parts.forEach((part, partIndex) => {
      const duplicatePartIndex = partIds.get(part.partId);

      if (duplicatePartIndex !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Part can only be added once per assembly',
          path: [assemblyIndex, 'parts', partIndex, 'partId'],
        });
        ctx.addIssue({
          code: 'custom',
          message: 'Part can only be added once per assembly',
          path: [assemblyIndex, 'parts', duplicatePartIndex, 'partId'],
        });
      } else {
        partIds.set(part.partId, partIndex);
      }
    });
  });

  assemblies.forEach((assembly, assemblyIndex) => {
    if (assembly.kind !== 'optional') {
      return;
    }

    const overrideIds = new Map<string, number>();

    assembly.overrideStandardAssemblyIds.forEach((standardAssemblyId, overrideIndex) => {
      const duplicateOverrideIndex = overrideIds.get(standardAssemblyId);

      if (duplicateOverrideIndex !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Override target can only be selected once per assembly',
          path: [assemblyIndex, 'overrideStandardAssemblyIds', overrideIndex],
        });
        ctx.addIssue({
          code: 'custom',
          message: 'Override target can only be selected once per assembly',
          path: [assemblyIndex, 'overrideStandardAssemblyIds', duplicateOverrideIndex],
        });
      } else {
        overrideIds.set(standardAssemblyId, overrideIndex);
      }

      if (!standardIds.has(standardAssemblyId)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Override target must reference a standard assembly on this product',
          path: [assemblyIndex, 'overrideStandardAssemblyIds', overrideIndex],
        });
      }
    });
  });
}

const ProductAssemblies = z.array(AssemblyInput).superRefine(refineProductAssemblies);

export type ProductAssembliesInput = z.infer<typeof ProductAssembliesInput>;
export const ProductAssembliesInput = ProductAssemblies.default([]);

export type Product = z.infer<typeof Product>;
export const Product = z.object({
  id: UUID,
  name: ProductName,
  description: ProductDescription,
  modelCode: ProductModelCode,
  basePrice: ProductBasePrice,
  buildTimeDays: ProductBuildTimeDays,
  currencyCode: ProductCurrencyCode,
  assemblies: z.array(Assembly).default([]),
  thumbnailDataUrl: NullableThumbnailDataUrl,
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type ProductSortBy = z.infer<typeof ProductSortBy>;
export const ProductSortBy = z.enum(['basePrice', 'createdAt', 'id', 'modelCode', 'name']);

export type ProductColumnFilters = z.infer<typeof ProductColumnFilters>;
export const ProductColumnFilters = z
  .object({
    id: z.string().trim().optional(),
    modelCode: z.string().trim().optional(),
    name: z.string().trim().optional(),
  })
  .default({});

export type ProductCreateInput = z.infer<typeof ProductCreateInput>;
export const ProductCreateInput = z
  .object({
    name: ProductName,
    description: ProductDescriptionInput,
    modelCode: ProductModelCode,
    basePrice: ProductBasePrice,
    assemblies: ProductAssembliesInput,
    buildTimeDays: ProductBuildTimeDaysInput,
    currencyCode: ProductCurrencyCode,
    thumbnailDataUrl: NullableThumbnailDataUrl.default(null),
  })
  .strict();

export type ProductUpdateInput = z.infer<typeof ProductUpdateInput>;
export const ProductUpdateInput = z
  .object({
    id: UUID,
    assemblies: ProductAssemblies.optional(),
    basePrice: ProductBasePrice,
    currencyCode: ProductCurrencyCode,
    description: ProductDescriptionInput,
    buildTimeDays: ProductBuildTimeDaysInput,
    modelCode: ProductModelCode,
    name: ProductName,
    thumbnailDataUrl: NullableThumbnailDataUrl.default(null),
  })
  .strict();

export type ProductListInput = z.infer<typeof ProductListInput>;
export const ProductListInput = createSearchedSortedPagedQueryInput({
  shape: {
    columnFilters: ProductColumnFilters,
  },
  sortBy: ProductSortBy.default('name'),
});

export type ProductListResult = z.infer<typeof ProductListResult>;
export const ProductListResult = createSortedPagedQueryResult(Product, ProductSortBy);
