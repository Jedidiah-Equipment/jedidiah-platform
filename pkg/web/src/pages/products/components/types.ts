import {
  AssemblyName,
  AssemblyPart,
  AssemblyPubliclyVisible,
  NullableThumbnailDataUrl,
  Price,
  PriceDelta,
  type Product,
  ProductBayDefaultWorkingDays,
  ProductBayInput,
  ProductBrochureEnabled,
  ProductBuildTimeDays,
  ProductCategory,
  ProductCreateInput,
  ProductDescription,
  ProductDisplayOrder,
  ProductKeyFeatures,
  ProductLaborHoursFormValue,
  ProductLanderEnabled,
  ProductMaterialQuantityPerUnitValue,
  ProductModelCode,
  ProductName,
  ProductNameHighlight,
  ProductRequiresVinNumber,
  ProductUpdateInput,
  refineProductAssemblies,
  refineProductBays,
  refineProductLaborHours,
  refineProductMaterialLines,
  UUID,
  type UUID as UUIDType,
  WorkItemDepartment,
} from '@pkg/schema';
import { z } from 'zod';

import type { SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';
import { emptyStringOr, requiredSelection } from '@/components/form/utils/form-schema.js';

// Form representation of an assembly: like the API `AssemblyInput` but without its coercion
// and defaults, so the controlled value shape matches what the editor holds. Field rules still
// come from the schema scalars (`AssemblyName`, `AssemblyPart`, `AssemblyPubliclyVisible`, `PriceDelta`, `UUID`).
// An unpicked Part holds `''`, so the form states the same "Select a part" the picker field shows
// rather than letting the raw `UUID` message reach the autosave banner.
const AssemblyPartFormInput = AssemblyPart.extend({
  partId: requiredSelection(UUID, 'Select a part'),
});

const StandardAssemblyFormInput = z.object({
  id: UUID.optional(),
  isPubliclyVisible: AssemblyPubliclyVisible,
  kind: z.literal('standard'),
  name: AssemblyName,
  parts: z.array(AssemblyPartFormInput),
});

const OptionalAssemblyFormInput = z.object({
  id: UUID.optional(),
  isPubliclyVisible: AssemblyPubliclyVisible,
  kind: z.literal('optional'),
  name: AssemblyName,
  overrideStandardAssemblyIds: z.array(UUID),
  parts: z.array(AssemblyPartFormInput),
  price: PriceDelta,
});

export type ProductAssemblyFormInput = z.infer<typeof ProductAssemblyFormInput>;
export const ProductAssemblyFormInput = z.discriminatedUnion('kind', [
  StandardAssemblyFormInput,
  OptionalAssemblyFormInput,
]);

export type ProductBayFormInput = z.infer<typeof ProductBayFormInput>;
export const ProductBayFormInput = ProductBayInput.extend({
  defaultWorkingDays: ProductBayDefaultWorkingDays,
});

const ProductMaterialLinesFormInput = z
  .array(z.object({ partId: UUID, quantityPerUnit: ProductMaterialQuantityPerUnitValue }))
  .superRefine(refineProductMaterialLines);

const ProductLaborHoursFormInput = z
  .array(z.object({ department: WorkItemDepartment, hours: ProductLaborHoursFormValue }))
  .superRefine(refineProductLaborHours);

const ProductFormFields = z.object({
  basePrice: Price,
  // `category` holds `''` for "no value" like other nullable text inputs.
  category: emptyStringOr(ProductCategory),
  currencyCode: z.literal('ZAR'),
  description: emptyStringOr(ProductDescription),
  displayOrder: ProductDisplayOrder,
  buildTimeDays: ProductBuildTimeDays,
  modelCode: ProductModelCode,
  name: ProductName,
  // `nameHighlight` holds `''` for "no value" like other nullable text inputs.
  nameHighlight: emptyStringOr(ProductNameHighlight),
  rangeId: requiredSelection(UUID, 'Select a range'),
  variantId: emptyStringOr(UUID),
  requiresVinNumber: ProductRequiresVinNumber,
  brochureEnabled: ProductBrochureEnabled,
  landerEnabled: ProductLanderEnabled,
  thumbnailDataUrl: NullableThumbnailDataUrl,
});

export type ProductFormValues = z.infer<typeof ProductFormValues>;
export const ProductFormValues = ProductFormFields.extend({
  assemblies: z.array(ProductAssemblyFormInput).superRefine(refineProductAssemblies),
  // Key-feature lines reuse the schema-owned content + cap rules.
  keyFeatures: ProductKeyFeatures,
  laborHours: ProductLaborHoursFormInput,
  materialLines: ProductMaterialLinesFormInput,
  productBays: z.array(ProductBayFormInput).superRefine(refineProductBays),
});

export type ProductCreateFormValues = z.infer<typeof ProductCreateFormValues>;
export const ProductCreateFormValues = ProductFormFields.pick({
  basePrice: true,
  buildTimeDays: true,
  modelCode: true,
  name: true,
  rangeId: true,
});

export const emptyProductFormValues: ProductFormValues = {
  assemblies: [],
  basePrice: NaN,
  category: '',
  currencyCode: 'ZAR',
  description: '',
  displayOrder: 0,
  buildTimeDays: NaN,
  keyFeatures: [],
  laborHours: [],
  materialLines: [],
  modelCode: '',
  name: '',
  nameHighlight: '',
  productBays: [],
  rangeId: '',
  variantId: '',
  requiresVinNumber: false,
  brochureEnabled: false,
  landerEnabled: false,
  thumbnailDataUrl: null,
};

/** Schema → form. `basePrice`/`buildTimeDays` use `NaN` so a missing number reads as empty. */
export function toProductFormValues(initialProduct?: Product): ProductFormValues {
  return {
    assemblies: toProductAssemblyInputs(initialProduct),
    basePrice: initialProduct?.basePrice ?? NaN,
    category: initialProduct?.category ?? '',
    currencyCode: initialProduct?.currencyCode ?? 'ZAR',
    description: initialProduct?.description ?? '',
    displayOrder: initialProduct?.displayOrder ?? 0,
    buildTimeDays: initialProduct?.buildTimeDays ?? NaN,
    keyFeatures: initialProduct?.keyFeatures ?? [],
    laborHours: initialProduct?.laborHours ?? [],
    materialLines: initialProduct?.materialLines ?? [],
    modelCode: initialProduct?.modelCode ?? '',
    name: initialProduct?.name ?? '',
    nameHighlight: initialProduct?.nameHighlight ?? '',
    productBays: toProductBayInputs(initialProduct),
    rangeId: initialProduct?.rangeId ?? '',
    variantId: initialProduct?.variantId ?? '',
    requiresVinNumber: initialProduct?.requiresVinNumber ?? false,
    brochureEnabled: initialProduct?.brochureEnabled ?? false,
    landerEnabled: initialProduct?.landerEnabled ?? false,
    thumbnailDataUrl: initialProduct?.thumbnailDataUrl ?? null,
  };
}

/** Maps a product's stored assemblies into the editor's input shape. */
export function toProductAssemblyInputs(initialProduct?: Product): ProductAssemblyFormInput[] {
  return (initialProduct?.assemblies ?? []).map((assembly) =>
    assembly.kind === 'standard'
      ? {
          id: assembly.id,
          isPubliclyVisible: assembly.isPubliclyVisible,
          kind: assembly.kind,
          name: assembly.name,
          parts: assembly.parts,
        }
      : {
          id: assembly.id,
          isPubliclyVisible: assembly.isPubliclyVisible,
          kind: assembly.kind,
          name: assembly.name,
          overrideStandardAssemblyIds: assembly.overrideStandardAssemblyIds,
          parts: assembly.parts,
          price: assembly.price,
        },
  );
}

export function toProductBayInputs(initialProduct?: Product): ProductBayFormInput[] {
  return (initialProduct?.productBays ?? []).map((productBay) => ({
    bayId: productBay.bayId,
    defaultWorkingDays: productBay.defaultWorkingDays,
  }));
}

export function toProductCreateInput(value: ProductFormValues): ProductCreateInput {
  return ProductCreateInput.parse(toProductApiInput(value));
}

export function toProductMinimalCreateInput(value: ProductCreateFormValues): ProductCreateInput {
  return ProductCreateInput.parse(value);
}

export function toProductUpdateInput(id: UUIDType, value: ProductFormValues): ProductUpdateInput {
  return ProductUpdateInput.parse({
    ...toProductApiInput(value),
    id,
  });
}

function toProductApiInput(value: ProductFormValues) {
  return {
    ...value,
    variantId: value.variantId || null,
  };
}

/**
 * Catalogue assembly names eligible to suggest for one assembly's name field: every catalogue name
 * except those already used by the product's other assemblies (`excludedNames`, matched
 * case-insensitively against live form state). De-duping, alphabetical ordering, and substring
 * filtering are left to the shared `CreatableComboboxField` that renders these options.
 */
export function getEligibleAssemblyNames(names: readonly string[], excludedNames: readonly string[]): string[] {
  const excluded = new Set(excludedNames.map((name) => name.trim().toLowerCase()).filter(Boolean));

  return names.filter((name) => !excluded.has(name.trim().toLowerCase()));
}

/**
 * Parts eligible to pick for one row of an assembly's parts table: everything except the parts the
 * assembly's *other* rows already hold, mirroring `getEligibleAssemblyNames`. An assembly may hold a
 * Part once (`refineProductAssemblies`), and that rule is a property of the array rather than of
 * either row, so no field can highlight it — keeping the duplicate unpickable is the only way the
 * user sees the constraint at the moment it applies. The row's own Part stays listed so its selection
 * still renders.
 */
export function getEligibleAssemblyParts<TPart extends { id: string }>(
  parts: readonly TPart[],
  assemblyParts: readonly { partId: string }[],
  currentIndex: number,
): TPart[] {
  const taken = new Set(
    assemblyParts.filter((_, index) => index !== currentIndex).map((assemblyPart) => assemblyPart.partId),
  );

  return parts.filter((part) => !taken.has(part.id));
}

/**
 * Raw materials pickable on the Costing tab: the periodic-stock Parts the material list does not
 * already hold, since a Product may hold a Part once (`refineProductMaterialLines`). The label
 * carries the code as well as the name because plate names repeat across thicknesses, and it is what
 * the picker shows once a Part is chosen.
 */
export function toProductRawMaterialOptions<
  TPart extends { code: string; id: string; name: string; stockTrackingMode: string },
>(parts: readonly TPart[], materialLines: readonly { partId: string }[]): SearchableComboboxOption[] {
  const taken = new Set(materialLines.map((line) => line.partId));

  return parts
    .filter((part) => part.stockTrackingMode === 'periodic' && !taken.has(part.id))
    .map((part) => ({ label: `${part.code} · ${part.name}`, value: part.id }));
}

/**
 * What the raw-material picker says before anything is chosen. An empty list has two unrelated
 * causes the user acts on differently — no Part is periodic-stock yet, or every eligible Part is
 * already on the list — so they never collapse into one message.
 */
export function rawMaterialPlaceholder({
  hasAvailableParts,
  hasPeriodicParts,
  isError,
  isLoading,
}: {
  hasAvailableParts: boolean;
  hasPeriodicParts: boolean;
  isError: boolean;
  isLoading: boolean;
}): string {
  if (isLoading) return 'Loading Parts...';
  if (isError) return 'Unable to load Parts';
  if (!hasPeriodicParts) return 'No periodic-stock Parts available';
  if (!hasAvailableParts) return 'All periodic-stock Parts added';

  return 'Search raw materials';
}
