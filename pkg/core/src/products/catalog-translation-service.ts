import { type Db, notRemoved, productAssemblies, productRanges, productRangeVariants, products } from '@pkg/db';
import {
  type CatalogSourceHashes,
  type CatalogTranslationKey,
  type CatalogTranslationKeyFor,
  type CatalogTranslationKind,
  type CatalogTranslationState,
  catalogSourceHashes,
  catalogTranslationFieldState,
  catalogTranslationKey,
  catalogTranslationNeedsAi,
  catalogTranslationState,
  parseCatalogTranslationKey,
} from '@pkg/domain';
import {
  type CatalogProductRangeTranslation,
  type CatalogProductRangeTranslationPatchInput,
  type CatalogProductRangeVariantTranslation,
  type CatalogProductRangeVariantTranslationPatchInput,
  type CatalogProductTranslation,
  type CatalogProductTranslationPatchInput,
  type CatalogTranslationEnvelope,
  type CatalogTranslationStatus,
  TRANSLATED_LOCALE,
  type TranslatableAssembly,
  type TranslatableProductFields,
  type TranslatableProductRangeFields,
  type TranslatableProductRangeVariantFields,
} from '@pkg/schema';
import { and, asc, eq, sql } from 'drizzle-orm';

import {
  CatalogProductRangeTranslationNotFoundError,
  CatalogProductRangeVariantTranslationNotFoundError,
  CatalogProductTranslationNotFoundError,
} from './catalog-translation-errors.js';

export type { CatalogTranslationState } from '@pkg/domain';

export type ProductCatalogTranslation = TranslatableProductFields & { assemblies: TranslatableAssembly[] };
export type ProductRangeCatalogTranslation = TranslatableProductRangeFields;
export type ProductRangeVariantCatalogTranslation = TranslatableProductRangeVariantFields;

type ProductTranslationSource = {
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
  canonical: ProductRangeCatalogTranslation;
  id: string;
  key: CatalogTranslationKeyFor<'range'>;
  kind: 'range';
  sourceHashes: CatalogSourceHashes<ProductRangeCatalogTranslation>;
  state: CatalogTranslationState;
};

type ProductRangeVariantTranslationSource = {
  canonical: ProductRangeVariantCatalogTranslation;
  id: string;
  key: CatalogTranslationKeyFor<'variant'>;
  kind: 'variant';
  sourceHashes: CatalogSourceHashes<ProductRangeVariantCatalogTranslation>;
  state: CatalogTranslationState;
};

type ProductSourceRow = typeof products.$inferSelect & { assemblies: Array<typeof productAssemblies.$inferSelect> };
type ProductRangeVariantSourceRow = Pick<typeof productRangeVariants.$inferSelect, 'id' | 'name' | 'translations'>;

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

type CatalogTranslationPatchResult<Translation> = {
  requeue: boolean;
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
  if (!row) throw new CatalogProductTranslationNotFoundError(id);
  return toCatalogProductTranslation(row);
}

export async function getCatalogProductRangeTranslation({
  db,
  id,
}: {
  db: Db;
  id: string;
}): Promise<CatalogProductRangeTranslation> {
  const row = await db.query.productRanges.findFirst({
    where: and(eq(productRanges.id, id), notRemoved(productRanges)),
  });
  if (!row) throw new CatalogProductRangeTranslationNotFoundError(id);
  return toCatalogProductRangeTranslation(row);
}

export async function getCatalogProductRangeVariantTranslation({
  db,
  id,
}: {
  db: Db;
  id: string;
}): Promise<CatalogProductRangeVariantTranslation> {
  const [row] = await db
    .select({
      id: productRangeVariants.id,
      name: productRangeVariants.name,
      translations: productRangeVariants.translations,
    })
    .from(productRangeVariants)
    .innerJoin(productRanges, eq(productRangeVariants.rangeId, productRanges.id))
    .where(and(eq(productRangeVariants.id, id), notRemoved(productRangeVariants), notRemoved(productRanges)))
    .limit(1);
  if (!row) throw new CatalogProductRangeVariantTranslationNotFoundError(id);
  return toCatalogProductRangeVariantTranslation(row);
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
    if (!productRow) throw new CatalogProductTranslationNotFoundError(input.id);

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
  return { requeue, translation };
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
  const requeue = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(productRanges)
      .where(and(eq(productRanges.id, input.id), notRemoved(productRanges)))
      .for('update');
    if (!row) throw new CatalogProductRangeTranslationNotFoundError(input.id);

    const patch = applyManualTranslationPatches(
      row.translations,
      { description: row.description, name: row.name },
      input.fields,
      now(),
    );
    if (patch.changed) {
      await tx.update(productRanges).set({ translations: patch.translations }).where(eq(productRanges.id, input.id));
    }
    return patch.requeue;
  });
  const translation = await getCatalogProductRangeTranslation({ db, id: input.id });
  return { requeue, translation };
}

export async function patchCatalogProductRangeVariantTranslation({
  db,
  input,
  now = () => new Date(),
}: {
  db: Db;
  input: CatalogProductRangeVariantTranslationPatchInput;
  now?: () => Date;
}): Promise<CatalogTranslationPatchResult<CatalogProductRangeVariantTranslation>> {
  const requeue = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: productRangeVariants.id,
        name: productRangeVariants.name,
        translations: productRangeVariants.translations,
      })
      .from(productRangeVariants)
      .innerJoin(productRanges, eq(productRangeVariants.rangeId, productRanges.id))
      .where(and(eq(productRangeVariants.id, input.id), notRemoved(productRangeVariants), notRemoved(productRanges)))
      .limit(1)
      .for('update');
    if (!row) throw new CatalogProductRangeVariantTranslationNotFoundError(input.id);

    const patch = applyManualTranslationPatches(row.translations, { name: row.name }, input.fields, now());
    if (patch.changed) {
      await tx
        .update(productRangeVariants)
        .set({ translations: patch.translations })
        .where(eq(productRangeVariants.id, input.id));
    }
    return patch.requeue;
  });
  const translation = await getCatalogProductRangeVariantTranslation({ db, id: input.id });
  return { requeue, translation };
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

export async function listCatalogTranslationKeys({ db }: { db: Db }): Promise<CatalogTranslationKey[]> {
  const [productRows, rangeRows, variantRows] = await Promise.all([
    db.select({ id: products.id }).from(products).where(notRemoved(products)).orderBy(asc(products.id)),
    db
      .select({ id: productRanges.id })
      .from(productRanges)
      .where(notRemoved(productRanges))
      .orderBy(asc(productRanges.id)),
    db
      .select({ id: productRangeVariants.id })
      .from(productRangeVariants)
      .innerJoin(productRanges, eq(productRangeVariants.rangeId, productRanges.id))
      .where(and(notRemoved(productRangeVariants), notRemoved(productRanges)))
      .orderBy(asc(productRangeVariants.id)),
  ]);

  return [
    ...productRows.map(({ id }) => catalogTranslationKey('product', id)),
    ...rangeRows.map(({ id }) => catalogTranslationKey('range', id)),
    ...variantRows.map(({ id }) => catalogTranslationKey('variant', id)),
  ];
}

export async function getCatalogTranslationStatus({ db }: { db: Db }): Promise<CatalogTranslationStatus> {
  const sources = await loadAllCatalogTranslationSources(db);
  const status: CatalogTranslationStatus = {
    products: { missing: 0, needsReview: 0, stale: 0 },
    ranges: { missing: 0, needsReview: 0, stale: 0 },
    variants: { missing: 0, needsReview: 0, stale: 0 },
  };

  for (const source of sources) {
    if (source.state === 'fresh') continue;
    const group =
      source.kind === 'product' ? status.products : source.kind === 'range' ? status.ranges : status.variants;
    group[source.state] += 1;
  }

  return status;
}

export async function listCatalogTranslationKeysNeedingTranslation({
  db,
}: {
  db: Db;
}): Promise<CatalogTranslationKey[]> {
  const sources = await loadAllCatalogTranslationSources(db);
  return sources.filter((source) => catalogTranslationNeedsAi(source.state)).map((source) => source.key);
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
    db
      .select({
        id: productRangeVariants.id,
        name: productRangeVariants.name,
        translations: productRangeVariants.translations,
      })
      .from(productRangeVariants)
      .innerJoin(productRanges, eq(productRangeVariants.rangeId, productRanges.id))
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
  const assemblySourceHashes = assemblies.map(({ id, name }) => ({ id, name: catalogSourceHashes({ name }).name }));
  const productTranslation = row.translations[TRANSLATED_LOCALE];
  const fieldStates = Object.entries(productSourceHashes).map(([field, sourceHash]) =>
    catalogTranslationFieldState(sourceHash, productTranslation?.[field as keyof typeof productTranslation]),
  );
  fieldStates.push(
    ...row.assemblies.map((assembly) =>
      catalogTranslationFieldState(
        catalogSourceHashes({ name: assembly.name }).name,
        assembly.translations[TRANSLATED_LOCALE]?.name,
      ),
    ),
  );
  const state = catalogTranslationState(fieldStates);

  return {
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
  const state = catalogTranslationState(
    Object.entries(sourceHashes).map(([field, sourceHash]) =>
      catalogTranslationFieldState(sourceHash, translation?.[field as keyof typeof translation]),
    ),
  );
  return { canonical, id: row.id, key: catalogTranslationKey('range', row.id), kind: 'range', sourceHashes, state };
}

async function loadVariantSource(db: Db, id: string): Promise<ProductRangeVariantTranslationSource | null> {
  const [row] = await db
    .select({
      id: productRangeVariants.id,
      name: productRangeVariants.name,
      translations: productRangeVariants.translations,
    })
    .from(productRangeVariants)
    .innerJoin(productRanges, eq(productRangeVariants.rangeId, productRanges.id))
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
  const state = catalogTranslationState([
    catalogTranslationFieldState(sourceHashes.name, row.translations[TRANSLATED_LOCALE]?.name),
  ]);
  return { canonical, id: row.id, key: catalogTranslationKey('variant', row.id), kind: 'variant', sourceHashes, state };
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
    const [row] = await tx
      .select({
        id: productRangeVariants.id,
        name: productRangeVariants.name,
        translations: productRangeVariants.translations,
      })
      .from(productRangeVariants)
      .innerJoin(productRanges, eq(productRangeVariants.rangeId, productRanges.id))
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

function toCatalogProductRangeTranslation(row: typeof productRanges.$inferSelect): CatalogProductRangeTranslation {
  const translation = row.translations[TRANSLATED_LOCALE];
  return {
    fields: {
      description: toCatalogTranslationField(row.description, translation?.description),
      name: toCatalogTranslationField(row.name, translation?.name),
    },
    id: row.id,
  };
}

function toCatalogProductRangeVariantTranslation(
  row: ProductRangeVariantSourceRow,
): CatalogProductRangeVariantTranslation {
  return {
    fields: {
      name: toCatalogTranslationField(row.name, row.translations[TRANSLATED_LOCALE]?.name),
    },
    id: row.id,
  };
}

function toCatalogTranslationField<Value>(
  canonical: Value,
  translation: CatalogTranslationEnvelope<Value> | undefined,
) {
  return {
    canonical,
    state: catalogTranslationFieldState(catalogSourceHashes({ value: canonical }).value, translation),
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
