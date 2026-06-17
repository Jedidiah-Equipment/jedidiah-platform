import { z } from 'zod';
import { DateIso } from '../common/date.js';
import { EntityImage } from '../common/image.js';
import { createSearchedSortedPagedQueryInput, createSortedPagedQueryResult } from '../common/pagination.js';
import { Price } from '../common/price.js';
import { nullableTrimmedText, nullableTrimmedTextInput, requiredTrimmedText } from '../common/text.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { UUID } from '../common/uuid.js';
import { Bay } from '../jobs/job.js';

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

export type ProductRequiresVinNumber = z.infer<typeof ProductRequiresVinNumber>;
export const ProductRequiresVinNumber = z.boolean();

export type ProductBayDefaultWorkingDays = z.infer<typeof ProductBayDefaultWorkingDays>;
export const ProductBayDefaultWorkingDays = z
  .number()
  .int('Default working days must be a whole number')
  .min(1, 'Default working days must be at least 1');

export type ProductBayDefaultWorkingDaysInput = z.infer<typeof ProductBayDefaultWorkingDaysInput>;
export const ProductBayDefaultWorkingDaysInput = z.coerce.number().pipe(ProductBayDefaultWorkingDays);

export type ProductBay = z.infer<typeof ProductBay>;
export const ProductBay = z.object({
  bay: Bay,
  bayId: UUID,
  defaultWorkingDays: ProductBayDefaultWorkingDays,
  productId: UUID,
});

export type ProductBayInput = z.infer<typeof ProductBayInput>;
export const ProductBayInput = z
  .object({
    bayId: UUID,
    defaultWorkingDays: ProductBayDefaultWorkingDaysInput,
  })
  .strict();

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

export function refineProductBays(productBays: ProductBayInput[], ctx: z.RefinementCtx): void {
  const bayIds = new Map<string, number>();

  productBays.forEach((productBay, index) => {
    const duplicateIndex = bayIds.get(productBay.bayId);

    if (duplicateIndex !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Bay can only be added once per product',
        path: [index, 'bayId'],
      });
      ctx.addIssue({
        code: 'custom',
        message: 'Bay can only be added once per product',
        path: [duplicateIndex, 'bayId'],
      });
    } else {
      bayIds.set(productBay.bayId, index);
    }
  });
}

const ProductBays = z.array(ProductBayInput).superRefine(refineProductBays);

export type ProductBaysInput = z.infer<typeof ProductBaysInput>;
export const ProductBaysInput = ProductBays.default([]);

// Soft caps on the freeform Brochure key-feature list. Tuned so a typical brochure stays within its
// "Key Features" block; the renderer reflows rather than clips, so these are guardrails, not hard limits.
export const BROCHURE_KEY_FEATURE_MAX_LENGTH = 120;
export const BROCHURE_KEY_FEATURES_MAX_COUNT = 12;

export type BrochureSubtitle = z.infer<typeof BrochureSubtitle>;
export const BrochureSubtitle = nullableTrimmedText();

export type BrochureSubtitleInput = z.infer<typeof BrochureSubtitleInput>;
export const BrochureSubtitleInput = nullableTrimmedTextInput();

export type BrochureKeyFeature = z.infer<typeof BrochureKeyFeature>;
export const BrochureKeyFeature = requiredTrimmedText('Key feature cannot be empty').max(
  BROCHURE_KEY_FEATURE_MAX_LENGTH,
  `Key feature must be ${BROCHURE_KEY_FEATURE_MAX_LENGTH} characters or fewer`,
);

export type BrochureKeyFeatures = z.infer<typeof BrochureKeyFeatures>;
export const BrochureKeyFeatures = z
  .array(BrochureKeyFeature)
  .max(BROCHURE_KEY_FEATURES_MAX_COUNT, `Add at most ${BROCHURE_KEY_FEATURES_MAX_COUNT} key features`);

// The four Brochure image slots. Each replaces in place, so a Product holds at most one current image
// per slot. Order is the brochure's visual order and drives the form's slot list.
export const BROCHURE_IMAGE_SLOTS = ['rangeLogo', 'hero', 'technicalDrawing', 'secondary'] as const;

export type BrochureImageSlot = z.infer<typeof BrochureImageSlot>;
export const BrochureImageSlot = z.enum(BROCHURE_IMAGE_SLOTS);

// Per-image size cap for Brochure slots. Allowed formats come from the shared {@link IMAGE_CONTENT_TYPES}.
export const BROCHURE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

// Recommended source dimensions and render fit per slot, shown on the form as upload guidance.
// `cover` photos/drawings center-crop to fill their slot; the `contain` range logo fits without cropping.
export type BrochureImageSlotSpec = {
  fit: 'contain' | 'cover';
  recommendedHeight: number;
  recommendedWidth: number;
};

export const BROCHURE_IMAGE_SLOT_SPECS = {
  rangeLogo: { fit: 'contain', recommendedHeight: 400, recommendedWidth: 600 },
  hero: { fit: 'cover', recommendedHeight: 1200, recommendedWidth: 1600 },
  technicalDrawing: { fit: 'cover', recommendedHeight: 1200, recommendedWidth: 1600 },
  secondary: { fit: 'cover', recommendedHeight: 900, recommendedWidth: 1200 },
} as const satisfies Record<BrochureImageSlot, BrochureImageSlotSpec>;

// Each slot exposes the shared {@link EntityImage} read shape (or null when empty).
export type BrochureImage = EntityImage;
export const BrochureImage = EntityImage;

export type BrochureImages = z.infer<typeof BrochureImages>;
export const BrochureImages = z.object({
  rangeLogo: BrochureImage.nullable().default(null),
  hero: BrochureImage.nullable().default(null),
  technicalDrawing: BrochureImage.nullable().default(null),
  secondary: BrochureImage.nullable().default(null),
});

export const EMPTY_BROCHURE_IMAGES: BrochureImages = {
  rangeLogo: null,
  hero: null,
  technicalDrawing: null,
  secondary: null,
};

export type BrochureConfig = z.infer<typeof BrochureConfig>;
export const BrochureConfig = z.object({
  // Images replace in place through their own upload endpoint, so they are read-only here and are not
  // part of {@link BrochureConfigInput} (the text-only autosave payload).
  images: BrochureImages.default(EMPTY_BROCHURE_IMAGES),
  keyFeatures: BrochureKeyFeatures,
  subtitle: BrochureSubtitle,
});

export type BrochureConfigInput = z.infer<typeof BrochureConfigInput>;
export const BrochureConfigInput = z
  .object({
    keyFeatures: BrochureKeyFeatures.default([]),
    subtitle: BrochureSubtitleInput,
  })
  .strict();

export const EMPTY_BROCHURE_CONFIG: BrochureConfig = {
  images: EMPTY_BROCHURE_IMAGES,
  keyFeatures: [],
  subtitle: null,
};

// The text-only default for the create/update payload. Kept separate from {@link EMPTY_BROCHURE_CONFIG}
// because the strict input schema rejects the read model's `images` field.
const EMPTY_BROCHURE_CONFIG_INPUT: BrochureConfigInput = { keyFeatures: [], subtitle: null };

// Identifies a single Product image slot for the replace-in-place upload and download routes.
export type BrochureImageSlotParams = z.infer<typeof BrochureImageSlotParams>;
export const BrochureImageSlotParams = z.object({
  productId: UUID,
  slot: BrochureImageSlot,
});

export type Product = z.infer<typeof Product>;
export const Product = z.object({
  id: UUID,
  name: ProductName,
  description: ProductDescription,
  modelCode: ProductModelCode,
  basePrice: ProductBasePrice,
  buildTimeDays: ProductBuildTimeDays,
  currencyCode: ProductCurrencyCode,
  rangeId: UUID,
  requiresVinNumber: ProductRequiresVinNumber,
  assemblies: z.array(Assembly).default([]),
  productBays: z.array(ProductBay).default([]),
  brochureConfig: BrochureConfig.default(EMPTY_BROCHURE_CONFIG),
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
    rangeId: UUID,
    assemblies: ProductAssembliesInput,
    productBays: ProductBaysInput,
    brochureConfig: BrochureConfigInput.default(EMPTY_BROCHURE_CONFIG_INPUT),
    buildTimeDays: ProductBuildTimeDaysInput,
    currencyCode: ProductCurrencyCode,
    requiresVinNumber: ProductRequiresVinNumber.default(false),
    thumbnailDataUrl: NullableThumbnailDataUrl.default(null),
  })
  .strict();

export type ProductUpdateInput = z.infer<typeof ProductUpdateInput>;
export const ProductUpdateInput = z
  .object({
    id: UUID,
    assemblies: ProductAssemblies.optional(),
    productBays: ProductBays.optional(),
    brochureConfig: BrochureConfigInput.optional(),
    basePrice: ProductBasePrice,
    currencyCode: ProductCurrencyCode,
    description: ProductDescriptionInput,
    buildTimeDays: ProductBuildTimeDaysInput,
    modelCode: ProductModelCode,
    name: ProductName,
    rangeId: UUID,
    requiresVinNumber: ProductRequiresVinNumber,
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
