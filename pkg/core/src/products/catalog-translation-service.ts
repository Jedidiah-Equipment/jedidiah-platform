import {
  type DatabaseTransaction,
  type Db,
  notRemoved,
  productAssemblies,
  productRanges,
  productRangeVariants,
  products,
} from '@pkg/db';
import {
  type CatalogSourceHashes,
  type CatalogTranslationKey,
  type CatalogTranslationKeyFor,
  type CatalogTranslationKind,
  type CatalogTranslationState,
  catalogSourceHash,
  catalogSourceHashes,
  catalogTranslationFieldState,
  catalogTranslationKey,
  catalogTranslationNeedsAi,
  catalogTranslationState,
  parseCatalogTranslationKey,
} from '@pkg/domain';
import {
  type CatalogProductNeedsReviewField,
  type CatalogProductRangeNeedsReviewField,
  type CatalogProductRangeTranslation,
  type CatalogProductRangeTranslationPatchInput,
  type CatalogProductRangeVariantNeedsReviewField,
  type CatalogProductTranslation,
  type CatalogProductTranslationPatchInput,
  type CatalogTranslationEnvelope,
  type CatalogTranslationNeedsReviewItem,
  type CatalogTranslationStatus,
  TRANSLATED_LOCALE,
  type TranslatableAssembly,
  type TranslatableProductFields,
  type TranslatableProductRangeFields,
  type TranslatableProductRangeVariantFields,
} from '@pkg/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { ProductRangeNotFoundError } from '../product-ranges/product-range-errors.js';

import { ProductNotFoundError } from './product-errors.js';

export type { CatalogTranslationState } from '@pkg/domain';

export type ProductCatalogTranslation = TranslatableProductFields & { assemblies: TranslatableAssembly[] };
export type ProductRangeCatalogTranslation = TranslatableProductRangeFields;
export type ProductRangeVariantCatalogTranslation = TranslatableProductRangeVariantFields;

type ProductTranslationSource = {
  affectedFields: CatalogProductNeedsReviewField[];
  canonical: ProductCatalogTranslation;
  id: string;
  key: CatalogTranslationKeyFor<'product'>;
  kind: 'product';
  sourceHashes: {
    assemblies: Array<{ id: string; name: string }>;
    product: CatalogSourceHashes<TranslatableProductFields>;
  };
  state: CatalogTranslationState;
};

type ProductRangeTranslationSource = {
  affectedFields: CatalogProductRangeNeedsReviewField[];
  canonical: ProductRangeCatalogTranslation;
  id: string;
  key: CatalogTranslationKeyFor<'range'>;
  kind: 'range';
  sourceHashes: CatalogSourceHashes<ProductRangeCatalogTranslation>;
  state: CatalogTranslationState;
};

type ProductRangeVariantTranslationSource = {
  affectedFields: CatalogProductRangeVariantNeedsReviewField[];
  canonical: ProductRangeVariantCatalogTranslation;
  id: string;
  key: CatalogTranslationKeyFor<'variant'>;
  kind: 'variant';
  rangeId: string;
  sourceHashes: CatalogSourceHashes<ProductRangeVariantCatalogTranslation>;
  state: CatalogTranslationState;
};

type ProductSourceRow = typeof products.$inferSelect & { assemblies: Array<typeof productAssemblies.$inferSelect> };
type ProductRangeVariantTranslationRow = Pick<typeof productRangeVariants.$inferSelect, 'id' | 'name' | 'translations'>;
type ProductRangeVariantSourceRow = ProductRangeVariantTranslationRow & { rangeId: string };

export type CatalogTranslationSource =
  | ProductTranslationSource
  | ProductRangeTranslationSource
  | ProductRangeVariantTranslationSource;

type CatalogTranslationSourceByKind = {
  product: ProductTranslationSource;
  range: ProductRangeTranslationSource;
  variant: ProductRangeVariantTranslationSource;
};

type CatalogTranslationByKind = {
  product: ProductCatalogTranslation;
  range: ProductRangeCatalogTranslation;
  variant: ProductRangeVariantCatalogTranslation;
};

type PersistCatalogTranslationInput<Kind extends CatalogTranslationKind> = {
  db: Db;
  kind: Kind;
  source: CatalogTranslationSourceByKind[Kind];
  translatedAt: Date;
  translation: CatalogTranslationByKind[Kind];
};

export type PersistCatalogTranslationResult = 'persisted' | 'skipped';

// Reverting a field to AI ownership leaves it missing, so the caller must requeue exactly the translation
// units that lost a value: a Product covers its assemblies, but each Variant is its own unit.
type CatalogTranslationPatchResult<Translation> = {
  requeueKeys: CatalogTranslationKey[];
  translation: Translation;
};

export async function loadCatalogTranslationSource({
  db,
  key,
}: {
  db: Db;
  key: CatalogTranslationKey;
}): Promise<CatalogTranslationSource | null> {
  const { id, kind } = parseCatalogTranslationKey(key);

  switch (kind) {
    case 'product':
      return loadProductSource(db, id);
    case 'range':
      return loadRangeSource(db, id);
    case 'variant':
      return loadVariantSource(db, id);
  }
}

export async function getCatalogProductTranslation({
  db,
  id,
}: {
  db: Db;
  id: string;
}): Promise<CatalogProductTranslation> {
  const row = await db.query.products.findFirst({
    where: and(eq(products.id, id), notRemoved(products)),
    with: { assemblies: { orderBy: [asc(productAssemblies.displayOrder), asc(productAssemblies.id)] } },
  });
  if (!row) throw new ProductNotFoundError(id);
  return toCatalogProductTranslation(row);
}

export async function getCatalogProductRangeTranslation({
  db,
  id,
}: {
  db: Db;
  id: string;
}): Promise<CatalogProductRangeTranslation> {
  const [row, variantRows] = await Promise.all([
    db.query.productRanges.findFirst({ where: and(eq(productRanges.id, id), notRemoved(productRanges)) }),
    selectVariantTranslationRows(db)
      .where(and(eq(productRangeVariants.rangeId, id), notRemoved(productRangeVariants)))
      .orderBy(asc(productRangeVariants.displayOrder), asc(productRangeVariants.id)),
  ]);
  if (!row) throw new ProductRangeNotFoundError(id);
  return toCatalogProductRangeTranslation(row, variantRows);
}

export async function patchCatalogProductTranslation({
  db,
  input,
  now = () => new Date(),
}: {
  db: Db;
  input: CatalogProductTranslationPatchInput;
  now?: () => Date;
}): Promise<CatalogTranslationPatchResult<CatalogProductTranslation>> {
  const requeue = await db.transaction(async (tx) => {
    const [productRow] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, input.id), notRemoved(products)))
      .for('update');
    if (!productRow) throw new ProductNotFoundError(input.id);

    const productCanonical = translatableProductFields(productRow);
    const productPatch = applyManualTranslationPatches(
      productRow.translations,
      productCanonical,
      input.fields ?? {},
      now(),
    );
    if (productPatch.changed) {
      await tx.update(products).set({ translations: productPatch.translations }).where(eq(products.id, input.id));
    }

    let shouldRequeue = productPatch.requeue;
    if (input.assemblies?.length) {
      const assemblyRows = await tx
        .select()
        .from(productAssemblies)
        .where(eq(productAssemblies.productId, input.id))
        .for('update');
      for (const assemblyInput of input.assemblies) {
        const assemblyRow = assemblyRows.find(({ id }) => id === assemblyInput.id);
        if (!assemblyRow) continue;
        const assemblyPatch = applyManualTranslationPatches(
          assemblyRow.translations,
          { name: assemblyRow.name },
          assemblyInput.fields,
          now(),
        );
        if (assemblyPatch.changed) {
          await tx
            .update(productAssemblies)
            .set({ translations: assemblyPatch.translations })
            .where(and(eq(productAssemblies.id, assemblyInput.id), eq(productAssemblies.productId, input.id)));
        }
        shouldRequeue ||= assemblyPatch.requeue;
      }
    }
    return shouldRequeue;
  });
  const translation = await getCatalogProductTranslation({ db, id: input.id });
  return { requeueKeys: requeue ? [catalogTranslationKey('product', input.id)] : [], translation };
}

export async function patchCatalogProductRangeTranslation({
  db,
  input,
  now = () => new Date(),
}: {
  db: Db;
  input: CatalogProductRangeTranslationPatchInput;
  now?: () => Date;
}): Promise<CatalogTranslationPatchResult<CatalogProductRangeTranslation>> {
  const requeueKeys = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(productRanges)
      .where(and(eq(productRanges.id, input.id), notRemoved(productRanges)))
      .for('update');
    if (!row) throw new ProductRangeNotFoundError(input.id);

    const keys: CatalogTranslationKey[] = [];
    const rangePatch = applyManualTranslationPatches(
      row.translations,
      { description: row.description, name: row.name },
      input.fields ?? {},
      now(),
    );
    if (rangePatch.changed) {
      await tx
        .update(productRanges)
        .set({ translations: rangePatch.translations })
        .where(eq(productRanges.id, input.id));
    }
    if (rangePatch.requeue) keys.push(catalogTranslationKey('range', input.id));

    if (input.variants?.length) {
      const variantRows = await selectVariantTranslationRows(tx)
        .where(and(eq(productRangeVariants.rangeId, input.id), notRemoved(productRangeVariants)))
        .for('update');
      for (const variantInput of input.variants) {
        const variantRow = variantRows.find(({ id }) => id === variantInput.id);
        if (!variantRow) continue;
        const variantPatch = applyManualTranslationPatches(
          variantRow.translations,
          { name: variantRow.name },
          variantInput.fields,
          now(),
        );
        if (variantPatch.changed) {
          await tx
            .update(productRangeVariants)
            .set({ translations: variantPatch.translations })
            .where(and(eq(productRangeVariants.id, variantInput.id), eq(productRangeVariants.rangeId, input.id)));
        }
        if (variantPatch.requeue) keys.push(catalogTranslationKey('variant', variantInput.id));
      }
    }

    return keys;
  });
  const translation = await getCatalogProductRangeTranslation({ db, id: input.id });
  return { requeueKeys, translation };
}

const persistCatalogTranslationByKind: {
  [Kind in CatalogTranslationKind]: (
    input: PersistCatalogTranslationInput<Kind>,
  ) => Promise<PersistCatalogTranslationResult>;
} = {
  product: persistProductTranslation,
  range: persistProductRangeTranslation,
  variant: persistProductRangeVariantTranslation,
};

// Each persist recompares the row's current source hash inside its own transaction and skips the write
// on a mismatch, so a catalog edit landing mid-translation can never publish a stale result.
export async function persistCatalogTranslation<Kind extends CatalogTranslationKind>(
  input: PersistCatalogTranslationInput<Kind>,
): Promise<PersistCatalogTranslationResult> {
  return persistCatalogTranslationByKind[input.kind](input);
}

export async function getCatalogTranslationStatus({ db }: { db: Db }): Promise<CatalogTranslationStatus> {
  const sources = await loadAllCatalogTranslationSources(db);
  const status: CatalogTranslationStatus = {
    products: { missing: 0, needsReview: 0, stale: 0 },
    ranges: { missing: 0, needsReview: 0, stale: 0 },
    variants: { missing: 0, needsReview: 0, stale: 0 },
  };

  for (const source of sources) {
    const group =
      source.kind === 'product' ? status.products : source.kind === 'range' ? status.ranges : status.variants;
    if (source.affectedFields.length > 0) group.needsReview += 1;
    if (source.state === 'missing' || source.state === 'stale') group[source.state] += 1;
  }

  return status;
}

export async function listCatalogTranslationsNeedingReview({
  db,
}: {
  db: Db;
}): Promise<CatalogTranslationNeedsReviewItem[]> {
  const sources = await loadAllCatalogTranslationSources(db);
  const items: CatalogTranslationNeedsReviewItem[] = [];
  // Each kind carries its own affectedFields shape, so the item is built per kind rather than generically.
  for (const source of sources) {
    if (source.affectedFields.length === 0) continue;
    const { affectedFields, canonical, id, kind } = source;
    if (kind === 'variant') {
      items.push({ affectedFields, id, kind, name: canonical.name, rangeId: source.rangeId });
    } else if (kind === 'range') {
      items.push({ affectedFields, id, kind, name: canonical.name });
    } else {
      items.push({ affectedFields, id, kind, name: canonical.name });
    }
  }
  return items;
}

export async function listCatalogTranslationKeysNeedingTranslation({
  db,
}: {
  db: Db;
}): Promise<CatalogTranslationKey[]> {
  const sources = await loadAllCatalogTranslationSources(db);
  return sources.filter((source) => catalogTranslationNeedsAi(source.state)).map((source) => source.key);
}

// Variants live behind their Range's soft delete, so every read of them joins and filters on both.
function selectVariantTranslationRows(db: Db | DatabaseTransaction) {
  return db
    .select({
      id: productRangeVariants.id,
      name: productRangeVariants.name,
      rangeId: productRangeVariants.rangeId,
      translations: productRangeVariants.translations,
    })
    .from(productRangeVariants)
    .innerJoin(productRanges, eq(productRangeVariants.rangeId, productRanges.id));
}

async function loadAllCatalogTranslationSources(db: Db): Promise<CatalogTranslationSource[]> {
  const [productRows, rangeRows, variantRows] = await Promise.all([
    db.query.products.findMany({
      orderBy: [asc(products.id)],
      where: notRemoved(products),
      with: { assemblies: { orderBy: [asc(productAssemblies.displayOrder), asc(productAssemblies.id)] } },
    }),
    db.query.productRanges.findMany({
      orderBy: [asc(productRanges.id)],
      where: notRemoved(productRanges),
    }),
    selectVariantTranslationRows(db)
      .where(and(notRemoved(productRangeVariants), notRemoved(productRanges)))
      .orderBy(asc(productRangeVariants.id)),
  ]);

  return [
    ...productRows.map((row) => toProductTranslationSource(row)),
    ...rangeRows.map((row) => toProductRangeTranslationSource(row)),
    ...variantRows.map((row) => toProductRangeVariantTranslationSource(row)),
  ];
}

async function loadProductSource(db: Db, id: string): Promise<ProductTranslationSource | null> {
  const row = await db.query.products.findFirst({
    where: and(eq(products.id, id), notRemoved(products)),
    with: { assemblies: { orderBy: [asc(productAssemblies.displayOrder), asc(productAssemblies.id)] } },
  });
  if (!row) return null;

  return toProductTranslationSource(row);
}

function toProductTranslationSource(row: ProductSourceRow): ProductTranslationSource {
  const productCanonical = translatableProductFields(row);
  const assemblies = row.assemblies.map(({ id: assemblyId, name }) => ({ id: assemblyId, name }));
  const canonical = { ...productCanonical, assemblies };
  const productSourceHashes = catalogSourceHashes(productCanonical);
  const assemblySourceHashes = assemblies.map(({ id, name }) => ({ id, name: catalogSourceHash(name) }));
  const productTranslation = row.translations[TRANSLATED_LOCALE];
  const productFields = (Object.keys(productSourceHashes) as Array<keyof TranslatableProductFields>).map((field) => ({
    field,
    state: catalogTranslationFieldState(productSourceHashes[field], productTranslation?.[field]),
  }));
  const assemblyFields = row.assemblies.map((assembly) => ({
    name: assembly.name,
    state: catalogTranslationFieldState(
      catalogSourceHash(assembly.name),
      assembly.translations[TRANSLATED_LOCALE]?.name,
    ),
  }));
  const fieldStates = [...productFields.map(({ state }) => state), ...assemblyFields.map(({ state }) => state)];
  const state = catalogTranslationState(fieldStates);
  const affectedFields: CatalogProductNeedsReviewField[] = [
    ...productFields
      .filter(({ state: fieldState }) => fieldState === 'needsReview')
      .map(({ field }) => ({ field, kind: 'product' as const })),
    ...assemblyFields
      .filter(({ state: fieldState }) => fieldState === 'needsReview')
      .map(({ name }) => ({ kind: 'assembly' as const, name })),
  ];

  return {
    affectedFields,
    canonical,
    id: row.id,
    key: catalogTranslationKey('product', row.id),
    kind: 'product',
    sourceHashes: { assemblies: assemblySourceHashes, product: productSourceHashes },
    state,
  };
}

async function loadRangeSource(db: Db, id: string): Promise<ProductRangeTranslationSource | null> {
  const row = await db.query.productRanges.findFirst({
    where: and(eq(productRanges.id, id), notRemoved(productRanges)),
  });
  if (!row) return null;

  return toProductRangeTranslationSource(row);
}

function toProductRangeTranslationSource(row: typeof productRanges.$inferSelect): ProductRangeTranslationSource {
  const canonical = { description: row.description, name: row.name };
  const sourceHashes = catalogSourceHashes(canonical);
  const translation = row.translations[TRANSLATED_LOCALE];
  const fields = (Object.keys(sourceHashes) as Array<keyof TranslatableProductRangeFields>).map((field) => ({
    field,
    state: catalogTranslationFieldState(sourceHashes[field], translation?.[field]),
  }));
  const state = catalogTranslationState(fields.map(({ state: fieldState }) => fieldState));
  const affectedFields = fields
    .filter(({ state: fieldState }) => fieldState === 'needsReview')
    .map(({ field }) => ({ field, kind: 'range' as const }));
  return {
    affectedFields,
    canonical,
    id: row.id,
    key: catalogTranslationKey('range', row.id),
    kind: 'range',
    sourceHashes,
    state,
  };
}

async function loadVariantSource(db: Db, id: string): Promise<ProductRangeVariantTranslationSource | null> {
  const [row] = await selectVariantTranslationRows(db)
    .where(and(eq(productRangeVariants.id, id), notRemoved(productRangeVariants), notRemoved(productRanges)))
    .limit(1);
  if (!row) return null;

  return toProductRangeVariantTranslationSource(row);
}

function toProductRangeVariantTranslationSource(
  row: ProductRangeVariantSourceRow,
): ProductRangeVariantTranslationSource {
  const canonical = { name: row.name };
  const sourceHashes = catalogSourceHashes(canonical);
  const fieldState = catalogTranslationFieldState(sourceHashes.name, row.translations[TRANSLATED_LOCALE]?.name);
  const state = catalogTranslationState([fieldState]);
  return {
    affectedFields: fieldState === 'needsReview' ? [{ field: 'name', kind: 'variant' }] : [],
    canonical,
    id: row.id,
    key: catalogTranslationKey('variant', row.id),
    kind: 'variant',
    rangeId: row.rangeId,
    sourceHashes,
    state,
  };
}

async function persistProductTranslation({
  db,
  source,
  translatedAt,
  translation,
}: PersistCatalogTranslationInput<'product'>): Promise<PersistCatalogTranslationResult> {
  return db.transaction(async (tx) => {
    const [productRow] = await tx
      .select()
      .from(products)
      .where(and(eq(products.id, source.id), notRemoved(products)))
      .for('update');
    if (!productRow) return 'skipped';
    const assemblyRows = await tx
      .select()
      .from(productAssemblies)
      .where(eq(productAssemblies.productId, source.id))
      .orderBy(asc(productAssemblies.displayOrder), asc(productAssemblies.id))
      .for('update');
    const row: ProductSourceRow = { ...productRow, assemblies: assemblyRows };

    const { assemblies, ...productTranslation } = translation;
    const current = toProductTranslationSource(row);
    const { assemblies: canonicalAssemblies, ...productCanonical } = current.canonical;
    const productPatch = createTranslationPatch({
      canonical: productCanonical,
      currentTranslation: row.translations[TRANSLATED_LOCALE],
      sourceHashes: source.sourceHashes.product,
      translatedAt,
      translation: productTranslation,
    });
    let persisted = false;
    if (Object.keys(productPatch).length > 0) {
      await tx
        .update(products)
        .set({ translations: mergeTranslationFields(products.translations, productPatch) })
        .where(and(eq(products.id, source.id), notRemoved(products)));
      persisted = true;
    }

    for (const assembly of assemblies) {
      const canonicalAssembly = canonicalAssemblies.find(({ id }) => id === assembly.id);
      const sourceHashes = source.sourceHashes.assemblies.find(({ id }) => id === assembly.id);
      const assemblyRow = row.assemblies.find(({ id }) => id === assembly.id);
      if (!canonicalAssembly || !sourceHashes || !assemblyRow) continue;
      const assemblyPatch = createTranslationPatch({
        canonical: { name: canonicalAssembly.name },
        currentTranslation: assemblyRow.translations[TRANSLATED_LOCALE],
        sourceHashes: { name: sourceHashes.name },
        translatedAt,
        translation: { name: assembly.name },
      });
      if (Object.keys(assemblyPatch).length === 0) continue;
      await tx
        .update(productAssemblies)
        .set({
          translations: mergeTranslationFields(productAssemblies.translations, assemblyPatch),
        })
        .where(and(eq(productAssemblies.id, assembly.id), eq(productAssemblies.productId, source.id)));
      persisted = true;
    }

    return persisted ? 'persisted' : 'skipped';
  });
}

async function persistProductRangeTranslation({
  db,
  source,
  translatedAt,
  translation,
}: PersistCatalogTranslationInput<'range'>): Promise<PersistCatalogTranslationResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(productRanges)
      .where(and(eq(productRanges.id, source.id), notRemoved(productRanges)))
      .for('update');
    if (!row) return 'skipped';

    const current = toProductRangeTranslationSource(row);
    const patch = createTranslationPatch({
      canonical: current.canonical,
      currentTranslation: row.translations[TRANSLATED_LOCALE],
      sourceHashes: source.sourceHashes,
      translatedAt,
      translation,
    });
    if (Object.keys(patch).length === 0) return 'skipped';

    await tx
      .update(productRanges)
      .set({ translations: mergeTranslationFields(productRanges.translations, patch) })
      .where(and(eq(productRanges.id, source.id), notRemoved(productRanges)));

    return 'persisted';
  });
}

async function persistProductRangeVariantTranslation({
  db,
  source,
  translatedAt,
  translation,
}: PersistCatalogTranslationInput<'variant'>): Promise<PersistCatalogTranslationResult> {
  return db.transaction(async (tx) => {
    const [row] = await selectVariantTranslationRows(tx)
      .where(and(eq(productRangeVariants.id, source.id), notRemoved(productRangeVariants), notRemoved(productRanges)))
      .limit(1)
      .for('update');
    if (!row) return 'skipped';

    const current = toProductRangeVariantTranslationSource(row);
    const patch = createTranslationPatch({
      canonical: current.canonical,
      currentTranslation: row.translations[TRANSLATED_LOCALE],
      sourceHashes: source.sourceHashes,
      translatedAt,
      translation,
    });
    if (Object.keys(patch).length === 0) return 'skipped';

    await tx
      .update(productRangeVariants)
      .set({
        translations: mergeTranslationFields(productRangeVariants.translations, patch),
      })
      .where(and(eq(productRangeVariants.id, source.id), notRemoved(productRangeVariants)));

    return 'persisted';
  });
}

function createTranslationPatch<Canonical extends object>({
  canonical,
  currentTranslation,
  sourceHashes,
  translatedAt,
  translation,
}: {
  canonical: Canonical;
  currentTranslation:
    | Partial<{
        [Field in keyof Canonical]: Pick<CatalogTranslationEnvelope<unknown>, 'isManual' | 'sourceHash'>;
      }>
    | undefined;
  sourceHashes: CatalogSourceHashes<Canonical>;
  translatedAt: Date;
  translation: Canonical;
}): Partial<{ [Field in keyof Canonical]: CatalogTranslationEnvelope<Canonical[Field]> }> {
  const currentSourceHashes = catalogSourceHashes(canonical);
  const patch: Partial<{ [Field in keyof Canonical]: CatalogTranslationEnvelope<Canonical[Field]> }> = {};

  for (const field of Object.keys(currentSourceHashes) as Array<keyof Canonical>) {
    const currentSourceHash = currentSourceHashes[field];
    if (currentSourceHash !== sourceHashes[field]) continue;
    if (currentTranslation?.[field]?.isManual) continue;
    if (catalogTranslationFieldState(currentSourceHash, currentTranslation?.[field]) === 'fresh') continue;

    patch[field] = {
      isManual: false,
      sourceHash: currentSourceHash,
      translatedAt: translatedAt.toISOString(),
      value: translation[field],
    };
  }

  return patch;
}

function translatableProductFields(row: typeof products.$inferSelect): TranslatableProductFields {
  return {
    category: row.category,
    description: row.description,
    keyFeatures: row.keyFeatures,
    name: row.name,
    nameHighlight: row.nameHighlight,
    technicalDetails: row.technicalDetails,
  };
}

function toCatalogProductTranslation(row: ProductSourceRow): CatalogProductTranslation {
  const canonical = translatableProductFields(row);
  const translation = row.translations[TRANSLATED_LOCALE];
  return {
    assemblies: row.assemblies.map((assembly) => ({
      fields: {
        name: toCatalogTranslationField(assembly.name, assembly.translations[TRANSLATED_LOCALE]?.name),
      },
      id: assembly.id,
    })),
    fields: {
      category: toCatalogTranslationField(canonical.category, translation?.category),
      description: toCatalogTranslationField(canonical.description, translation?.description),
      keyFeatures: toCatalogTranslationField(canonical.keyFeatures, translation?.keyFeatures),
      name: toCatalogTranslationField(canonical.name, translation?.name),
      nameHighlight: toCatalogTranslationField(canonical.nameHighlight, translation?.nameHighlight),
      technicalDetails: toCatalogTranslationField(canonical.technicalDetails, translation?.technicalDetails),
    },
    id: row.id,
  };
}

function toCatalogProductRangeTranslation(
  row: typeof productRanges.$inferSelect,
  variantRows: ProductRangeVariantTranslationRow[],
): CatalogProductRangeTranslation {
  const translation = row.translations[TRANSLATED_LOCALE];
  return {
    fields: {
      description: toCatalogTranslationField(row.description, translation?.description),
      name: toCatalogTranslationField(row.name, translation?.name),
    },
    id: row.id,
    variants: variantRows.map((variant) => ({
      fields: { name: toCatalogTranslationField(variant.name, variant.translations[TRANSLATED_LOCALE]?.name) },
      id: variant.id,
    })),
  };
}

function toCatalogTranslationField<Value>(
  canonical: Value,
  translation: CatalogTranslationEnvelope<Value> | undefined,
) {
  return {
    canonical,
    state: catalogTranslationFieldState(catalogSourceHash(canonical), translation),
    ...(translation ? { translation } : {}),
  };
}

type ManualTranslationFieldPatch<Value> = { isManual: false } | { isManual: true; value: Value };
type ManualTranslationFieldPatches<Canonical extends object> = Partial<{
  [Field in keyof Canonical]: ManualTranslationFieldPatch<Canonical[Field]> | undefined;
}>;
type TranslationFields<Canonical extends object> = Partial<{
  [Field in keyof Canonical]: CatalogTranslationEnvelope<Canonical[Field]>;
}>;
type TranslationMap<Canonical extends object> = Partial<Record<string, TranslationFields<Canonical>>>;

function applyManualTranslationPatches<Canonical extends object>(
  translations: TranslationMap<Canonical>,
  canonical: Canonical,
  patches: ManualTranslationFieldPatches<Canonical>,
  updatedAt: Date,
): { changed: boolean; requeue: boolean; translations: TranslationMap<Canonical> } {
  const localeTranslation: TranslationFields<Canonical> = { ...translations[TRANSLATED_LOCALE] };
  const sourceHashes = catalogSourceHashes(canonical);
  let changed = false;
  let requeue = false;

  for (const field of Object.keys(patches) as Array<keyof Canonical>) {
    const patch = patches[field];
    if (!patch) continue;

    if (patch.isManual) {
      localeTranslation[field] = {
        isManual: true,
        sourceHash: sourceHashes[field],
        translatedAt: updatedAt.toISOString(),
        value: patch.value,
      };
      changed = true;
      continue;
    }

    if (!localeTranslation[field]?.isManual) continue;
    delete localeTranslation[field];
    changed = true;
    requeue = true;
  }

  return {
    changed,
    requeue,
    translations: changed ? { ...translations, [TRANSLATED_LOCALE]: localeTranslation } : translations,
  };
}

function mergeTranslationFields(
  column:
    | typeof productAssemblies.translations
    | typeof productRanges.translations
    | typeof productRangeVariants.translations
    | typeof products.translations,
  fields: Record<string, CatalogTranslationEnvelope<unknown>> | object,
) {
  return sql`jsonb_set(
    ${column},
    array[${TRANSLATED_LOCALE}]::text[],
    coalesce(${column} -> ${TRANSLATED_LOCALE}, '{}'::jsonb) || ${JSON.stringify(fields)}::jsonb,
    true
  )`;
}
