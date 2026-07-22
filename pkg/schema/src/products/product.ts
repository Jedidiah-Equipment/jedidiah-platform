import { z } from 'zod';
import { DateIso } from '../common/date.js';
import { EntityFile } from '../common/file.js';
import { createSearchedSortedPagedQueryInput, createSortedPagedQueryResult } from '../common/pagination.js';
import { Price, PriceDelta, PriceDeltaInput } from '../common/price.js';
import {
  nullableTrimmedText,
  nullableTrimmedTextInput,
  nullableTrimmedTextInputOptional,
  requiredTrimmedText,
} from '../common/text.js';
import { NullableThumbnailDataUrl } from '../common/thumbnail.js';
import { UUID } from '../common/uuid.js';
import { Bay } from '../jobs/job.js';
import {
  catalogTranslationEnvelope,
  TranslatableAssemblyFields,
  TranslatableProductFields,
} from './catalog-translation.js';
import { ProductRangeOption, ProductRangeVariantOption } from './product-range.js';
import { ProductBuildTimeDays, ProductBuildTimeDaysInput } from './product-shared.js';

export { ProductBuildTimeDays, ProductBuildTimeDaysInput } from './product-shared.js';

export type ProductName = z.infer<typeof ProductName>;
export const ProductName = requiredTrimmedText('Product name is required');

export type ProductModelCode = z.infer<typeof ProductModelCode>;
export const ProductModelCode = requiredTrimmedText('Model code is required');

export type ProductDisplayOrder = z.infer<typeof ProductDisplayOrder>;
export const ProductDisplayOrder = z.number().int('Display order must be a whole number');

export type ProductNameHighlight = z.infer<typeof ProductNameHighlight>;
export const ProductNameHighlight = nullableTrimmedText();

export type ProductNameHighlightInput = z.infer<typeof ProductNameHighlightInput>;
export const ProductNameHighlightInput = nullableTrimmedTextInput();

export type ProductDescription = z.infer<typeof ProductDescription>;
export const ProductDescription = nullableTrimmedText();

export type ProductDescriptionInput = z.infer<typeof ProductDescriptionInput>;
export const ProductDescriptionInput = nullableTrimmedTextInput();

export type ProductBasePrice = z.infer<typeof ProductBasePrice>;
export const ProductBasePrice = z.coerce.number().pipe(Price);

export type ProductCurrencyCode = z.infer<typeof ProductCurrencyCode>;
export const ProductCurrencyCode = z.literal('ZAR').default('ZAR');
export const DEFAULT_PRODUCT_CURRENCY_CODE: ProductCurrencyCode = 'ZAR';

export type ProductRequiresVinNumber = z.infer<typeof ProductRequiresVinNumber>;
export const ProductRequiresVinNumber = z.boolean();

// Publish toggles. A Product Brochure/Lander page only goes "ready" (and so public/linkable) once the
// matching flag is switched on AND the matching completeness predicate passes. Defaults false so a new
// Product is never published until someone fills it in and ticks the box.
export type ProductBrochureEnabled = z.infer<typeof ProductBrochureEnabled>;
export const ProductBrochureEnabled = z.boolean();

export type ProductLanderEnabled = z.infer<typeof ProductLanderEnabled>;
export const ProductLanderEnabled = z.boolean();

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

export type ProductAssemblyTranslation = z.infer<typeof ProductAssemblyTranslation>;
export const ProductAssemblyTranslation = z
  .object({ name: catalogTranslationEnvelope(TranslatableAssemblyFields.shape.name) })
  .partial();

export type ProductAssemblyTranslations = z.infer<typeof ProductAssemblyTranslations>;
export const ProductAssemblyTranslations = z.partialRecord(z.string(), ProductAssemblyTranslation);

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
  translations: ProductAssemblyTranslations.optional(),
});

export type OptionalAssembly = z.infer<typeof OptionalAssembly>;
export const OptionalAssembly = z.object({
  id: UUID,
  productId: UUID,
  kind: z.literal('optional'),
  name: AssemblyName,
  price: PriceDelta,
  parts: z.array(AssemblyPart),
  translations: ProductAssemblyTranslations.optional(),
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
  price: PriceDeltaInput,
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

// Soft caps on the freeform key-feature list. Tuned so a typical brochure stays within its "Key Features"
// block; the renderer reflows rather than clips, so these are guardrails, not hard limits.
export const PRODUCT_KEY_FEATURE_MAX_LENGTH = 120;
export const PRODUCT_KEY_FEATURES_MAX_COUNT = 12;

// The freeform category line shown under the Product title (e.g. “Silage & Grain”). A plain nullable text
// field used across surfaces — the brochure eyebrow and the Lander tagline — not a taxonomy/enum/FK.
export type ProductCategory = z.infer<typeof ProductCategory>;
export const ProductCategory = nullableTrimmedText();

export type ProductCategoryInput = z.infer<typeof ProductCategoryInput>;
export const ProductCategoryInput = nullableTrimmedTextInput();

export type ProductKeyFeature = z.infer<typeof ProductKeyFeature>;
export const ProductKeyFeature = requiredTrimmedText('Key feature cannot be empty').max(
  PRODUCT_KEY_FEATURE_MAX_LENGTH,
  `Key feature must be ${PRODUCT_KEY_FEATURE_MAX_LENGTH} characters or fewer`,
);

export type ProductKeyFeatures = z.infer<typeof ProductKeyFeatures>;
export const ProductKeyFeatures = z
  .array(ProductKeyFeature)
  .max(PRODUCT_KEY_FEATURES_MAX_COUNT, `Add at most ${PRODUCT_KEY_FEATURES_MAX_COUNT} key features`);

// The label/value spec pairs shown as the Lander hero "highlight tiles" (value is the bold headline,
// label the small-caps caption). Capped low to keep the three-up tile grid tidy; the soft cap is the
// zod array max, so the editor offers at most this many rows.
export const PRODUCT_TECHNICAL_DETAIL_VALUE_MAX_LENGTH = 24;
export const PRODUCT_TECHNICAL_DETAIL_LABEL_MAX_LENGTH = 48;
export const PRODUCT_TECHNICAL_DETAILS_MAX_COUNT = 3;

export type ProductTechnicalDetailValue = z.infer<typeof ProductTechnicalDetailValue>;
export const ProductTechnicalDetailValue = requiredTrimmedText('Technical detail value cannot be empty').max(
  PRODUCT_TECHNICAL_DETAIL_VALUE_MAX_LENGTH,
  `Technical detail value must be ${PRODUCT_TECHNICAL_DETAIL_VALUE_MAX_LENGTH} characters or fewer`,
);

export type ProductTechnicalDetailLabel = z.infer<typeof ProductTechnicalDetailLabel>;
export const ProductTechnicalDetailLabel = requiredTrimmedText('Technical detail label cannot be empty').max(
  PRODUCT_TECHNICAL_DETAIL_LABEL_MAX_LENGTH,
  `Technical detail label must be ${PRODUCT_TECHNICAL_DETAIL_LABEL_MAX_LENGTH} characters or fewer`,
);

export type ProductTechnicalDetail = z.infer<typeof ProductTechnicalDetail>;
export const ProductTechnicalDetail = z.object({
  label: ProductTechnicalDetailLabel,
  value: ProductTechnicalDetailValue,
});

export type ProductTechnicalDetails = z.infer<typeof ProductTechnicalDetails>;
export const ProductTechnicalDetails = z
  .array(ProductTechnicalDetail)
  .max(PRODUCT_TECHNICAL_DETAILS_MAX_COUNT, `Add at most ${PRODUCT_TECHNICAL_DETAILS_MAX_COUNT} technical details`);

export type ProductTranslation = z.infer<typeof ProductTranslation>;
export const ProductTranslation = z
  .object({
    name: catalogTranslationEnvelope(TranslatableProductFields.shape.name),
    nameHighlight: catalogTranslationEnvelope(TranslatableProductFields.shape.nameHighlight),
    category: catalogTranslationEnvelope(TranslatableProductFields.shape.category),
    description: catalogTranslationEnvelope(TranslatableProductFields.shape.description),
    keyFeatures: catalogTranslationEnvelope(TranslatableProductFields.shape.keyFeatures),
    technicalDetails: catalogTranslationEnvelope(TranslatableProductFields.shape.technicalDetails),
  })
  .partial();

export type ProductTranslations = z.infer<typeof ProductTranslations>;
export const ProductTranslations = z.partialRecord(z.string(), ProductTranslation);

// The canonical Product image slots. Each replaces in place, so a Product holds at most one current image
// per slot. Order is the visual order and drives the form's slot grid, the upload/download routes, and
// storage. The top-right brochure logo is not a slot here — it comes from the owning Product Range's image.
export const PRODUCT_IMAGE_SLOTS = ['primary', 'technicalDrawing', 'banner', 'secondary1', 'secondary2'] as const;

export type ProductImageSlot = z.infer<typeof ProductImageSlot>;
export const ProductImageSlot = z.enum(PRODUCT_IMAGE_SLOTS);

// The subset of Product image slots the Brochure PDF renders and the completeness predicate gates on.
// The extra `secondary1`/`secondary2` slots are Lander-only detail imagery and never reach the brochure.
export const BROCHURE_IMAGE_SLOTS = [
  'primary',
  'technicalDrawing',
  'banner',
] as const satisfies readonly ProductImageSlot[];

// The subset of Product image slots the public Lander detail page renders (the hero + gallery) and the
// lander-completeness predicate gates on. The brochure-only `technicalDrawing`/`banner` slots never reach
// the Lander.
export const LANDER_IMAGE_SLOTS = [
  'primary',
  'secondary1',
  'secondary2',
] as const satisfies readonly ProductImageSlot[];

// Per-image size cap for Product image slots. Allowed formats come from the shared {@link IMAGE_CONTENT_TYPES}.
export const PRODUCT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

// Recommended source dimensions and render fit per slot, shown on the form as upload guidance.
// `cover` photos fill their slot; the `contain` technical drawing preserves the whole image.
export type ProductImageSlotSpec = {
  fit: 'contain' | 'cover';
  // Overrides the editor's default 16:9 preview when a slot renders into a distinct fixed frame.
  previewAspectRatio?: `${number} / ${number}`;
  recommendedHeight: number;
  recommendedWidth: number;
};

export const PRODUCT_IMAGE_SLOT_SPECS = {
  primary: { fit: 'cover', recommendedHeight: 1200, recommendedWidth: 1600 },
  technicalDrawing: { fit: 'contain', recommendedHeight: 1200, recommendedWidth: 1600 },
  banner: { fit: 'cover', previewAspectRatio: '30 / 11', recommendedHeight: 880, recommendedWidth: 2400 },
  secondary1: { fit: 'cover', recommendedHeight: 1200, recommendedWidth: 1600 },
  secondary2: { fit: 'cover', recommendedHeight: 1200, recommendedWidth: 1600 },
} as const satisfies Record<ProductImageSlot, ProductImageSlotSpec>;

// Each slot exposes the shared {@link EntityFile} read shape (or null when empty).
export type ProductImage = EntityFile;
export const ProductImage = EntityFile;

export type ProductImages = z.infer<typeof ProductImages>;
export const ProductImages = z.object({
  primary: ProductImage.nullable().default(null),
  technicalDrawing: ProductImage.nullable().default(null),
  banner: ProductImage.nullable().default(null),
  secondary1: ProductImage.nullable().default(null),
  secondary2: ProductImage.nullable().default(null),
});

export const EMPTY_PRODUCT_IMAGES: ProductImages = {
  primary: null,
  technicalDrawing: null,
  banner: null,
  secondary1: null,
  secondary2: null,
};

// The required fields a Product Brochure must fill before it can be previewed or generated. This is the
// vocabulary the completeness predicate (`evaluateBrochureCompleteness` in @pkg/domain) reports against;
// the order is the order missing fields surface in the form alert. The image entries reuse the
// {@link BROCHURE_IMAGE_SLOTS} keys so consumers can map them straight to slot labels.
export const BROCHURE_REQUIRED_FIELDS = [
  'category',
  'keyFeatures',
  ...BROCHURE_IMAGE_SLOTS,
  'description',
  'assemblies',
] as const;

export type BrochureRequiredField = z.infer<typeof BrochureRequiredField>;
export const BrochureRequiredField = z.enum(BROCHURE_REQUIRED_FIELDS);

// The brochure-completeness verdict: whether the brochure has everything it needs, plus the exact
// still-missing required fields. Computed by `evaluateBrochureCompleteness` (@pkg/domain); a single
// source of truth reused by the form alert and, later, the preview and quote/job generation gates.
export type BrochureCompleteness = z.infer<typeof BrochureCompleteness>;
export const BrochureCompleteness = z.object({
  complete: z.boolean(),
  missingFields: z.array(BrochureRequiredField),
});

// The required fields a Product Lander page must fill before it can be published. Mirrors
// {@link BROCHURE_REQUIRED_FIELDS} but for the public detail page: the lander gallery slots
// ({@link LANDER_IMAGE_SLOTS}) instead of the brochure slots, and `standardAssembly` (at least one
// standard assembly) instead of the brochure's any-assembly check. Order is the order missing fields
// surface in the form aside.
export const LANDER_REQUIRED_FIELDS = [
  'category',
  'keyFeatures',
  ...LANDER_IMAGE_SLOTS,
  'description',
  'standardAssembly',
] as const;

export type LanderRequiredField = z.infer<typeof LanderRequiredField>;
export const LanderRequiredField = z.enum(LANDER_REQUIRED_FIELDS);

// The lander-completeness verdict: whether the Lander detail page has everything it needs, plus the exact
// still-missing required fields. Computed by `evaluateLanderCompleteness` (@pkg/domain); the single source
// of truth reused by the form aside and the public lander gates (catalog, detail, related strip).
export type LanderCompleteness = z.infer<typeof LanderCompleteness>;
export const LanderCompleteness = z.object({
  complete: z.boolean(),
  missingFields: z.array(LanderRequiredField),
});

// Identifies a single Product image slot for the replace-in-place upload and download routes.
export type ProductImageSlotParams = z.infer<typeof ProductImageSlotParams>;
export const ProductImageSlotParams = z.object({
  productId: UUID,
  slot: ProductImageSlot,
});

export type Product = z.infer<typeof Product>;
export const Product = z.object({
  id: UUID,
  name: ProductName,
  nameHighlight: ProductNameHighlight.default(null),
  description: ProductDescription,
  modelCode: ProductModelCode,
  displayOrder: ProductDisplayOrder.default(0),
  range: ProductRangeOption,
  basePrice: ProductBasePrice,
  buildTimeDays: ProductBuildTimeDays,
  currencyCode: ProductCurrencyCode,
  rangeId: UUID,
  variantId: UUID.nullable(),
  variant: ProductRangeVariantOption.nullable(),
  requiresVinNumber: ProductRequiresVinNumber,
  brochureEnabled: ProductBrochureEnabled.default(false),
  landerEnabled: ProductLanderEnabled.default(false),
  assemblies: z.array(Assembly).default([]),
  productBays: z.array(ProductBay).default([]),
  category: ProductCategory.default(null),
  keyFeatures: ProductKeyFeatures.default([]),
  technicalDetails: ProductTechnicalDetails.default([]),
  translations: ProductTranslations.optional(),
  // Images replace in place through their own upload endpoint, so they are read-only here and stay out of
  // the create/update inputs (the text-only autosave payload).
  images: ProductImages.default(EMPTY_PRODUCT_IMAGES),
  thumbnailDataUrl: NullableThumbnailDataUrl,
  createdAt: DateIso,
  updatedAt: DateIso,
});

export type ProductSortBy = z.infer<typeof ProductSortBy>;
export const ProductSortBy = z.enum([
  'basePrice',
  'createdAt',
  'id',
  'displayOrder',
  'modelCode',
  'name',
  'rangeName',
  'updatedAt',
  'variantName',
]);

export type ProductColumnFilters = z.infer<typeof ProductColumnFilters>;
export const ProductColumnFilters = z
  .object({
    id: z.string().trim().optional(),
    modelCode: z.string().trim().optional(),
    name: z.string().trim().optional(),
    rangeId: UUID.optional(),
    variantId: UUID.optional(),
  })
  .default({});

export type ProductCreateInput = z.infer<typeof ProductCreateInput>;
export const ProductCreateInput = z
  .object({
    name: ProductName,
    nameHighlight: ProductNameHighlightInput.default(null),
    description: ProductDescriptionInput,
    modelCode: ProductModelCode,
    displayOrder: ProductDisplayOrder.default(0),
    basePrice: ProductBasePrice,
    rangeId: UUID,
    variantId: UUID.nullable().default(null),
    assemblies: ProductAssembliesInput,
    productBays: ProductBaysInput,
    category: ProductCategoryInput,
    keyFeatures: ProductKeyFeatures.default([]),
    technicalDetails: ProductTechnicalDetails.default([]),
    buildTimeDays: ProductBuildTimeDaysInput,
    currencyCode: ProductCurrencyCode,
    requiresVinNumber: ProductRequiresVinNumber.default(false),
    brochureEnabled: ProductBrochureEnabled.default(false),
    landerEnabled: ProductLanderEnabled.default(false),
    thumbnailDataUrl: NullableThumbnailDataUrl.default(null),
  })
  .strict();

export type ProductUpdateInput = z.infer<typeof ProductUpdateInput>;
export const ProductUpdateInput = z
  .object({
    id: UUID,
    assemblies: ProductAssemblies.optional(),
    productBays: ProductBays.optional(),
    // Text marketing fields fold into the Product update; omitting them preserves the stored value,
    // mirroring how assemblies and product bays are preserved when absent.
    category: nullableTrimmedTextInputOptional(),
    keyFeatures: ProductKeyFeatures.optional(),
    technicalDetails: ProductTechnicalDetails.optional(),
    basePrice: ProductBasePrice,
    currencyCode: ProductCurrencyCode,
    description: ProductDescriptionInput,
    buildTimeDays: ProductBuildTimeDaysInput,
    displayOrder: ProductDisplayOrder.optional(),
    modelCode: ProductModelCode,
    name: ProductName,
    // Omitting preserves the stored highlight, like category and the other marketing fields above.
    nameHighlight: nullableTrimmedTextInputOptional(),
    rangeId: UUID,
    variantId: UUID.nullable().optional(),
    requiresVinNumber: ProductRequiresVinNumber,
    brochureEnabled: ProductBrochureEnabled,
    landerEnabled: ProductLanderEnabled,
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

export type AssemblyNameListResult = z.infer<typeof AssemblyNameListResult>;
export const AssemblyNameListResult = z.object({
  names: z.array(AssemblyName),
});
