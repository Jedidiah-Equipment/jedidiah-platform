import { type Db, notRemoved, productAssemblies, productRanges, productRangeVariants, products } from '@pkg/db';
import {
  type CatalogTranslationKey,
  type CatalogTranslationKeyFor,
  type CatalogTranslationKind,
  type CatalogTranslationState,
  catalogTranslationKey,
  catalogTranslationState,
  parseCatalogTranslationKey,
  productRangeSourceHash,
  productRangeVariantSourceHash,
  productSourceHash,
} from '@pkg/domain';
import {
  type CatalogTranslationMetadata,
  type CatalogTranslationStatus,
  TRANSLATED_LOCALE,
  type TranslatableAssembly,
  type TranslatableAssemblyFields,
  type TranslatableProductFields,
  type TranslatableProductRangeFields,
  type TranslatableProductRangeVariantFields,
} from '@pkg/schema';
import { and, asc, eq, sql } from 'drizzle-orm';

export type { CatalogTranslationState } from '@pkg/domain';

export type ProductCatalogTranslation = TranslatableProductFields & { assemblies: TranslatableAssembly[] };
export type ProductRangeCatalogTranslation = TranslatableProductRangeFields;
export type ProductRangeVariantCatalogTranslation = TranslatableProductRangeVariantFields;

type ProductTranslationSource = {
  canonical: ProductCatalogTranslation;
  id: string;
  key: CatalogTranslationKeyFor<'product'>;
  kind: 'product';
  sourceHash: string;
  state: CatalogTranslationState;
};

type ProductRangeTranslationSource = {
  canonical: ProductRangeCatalogTranslation;
  id: string;
  key: CatalogTranslationKeyFor<'range'>;
  kind: 'range';
  sourceHash: string;
  state: CatalogTranslationState;
};

type ProductRangeVariantTranslationSource = {
  canonical: ProductRangeVariantCatalogTranslation;
  id: string;
  key: CatalogTranslationKeyFor<'variant'>;
  kind: 'variant';
  sourceHash: string;
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
    products: { missing: 0, stale: 0 },
    ranges: { missing: 0, stale: 0 },
    variants: { missing: 0, stale: 0 },
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
  return sources.filter((source) => source.state !== 'fresh').map((source) => source.key);
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
  const canonical = {
    assemblies: row.assemblies.map(({ id: assemblyId, name }) => ({ id: assemblyId, name })),
    category: row.category,
    description: row.description,
    keyFeatures: row.keyFeatures,
    name: row.name,
    nameHighlight: row.nameHighlight,
    technicalDetails: row.technicalDetails,
  };
  const sourceHash = productSourceHash(canonical, canonical.assemblies);
  const state = catalogTranslationState(sourceHash, [
    row.translations[TRANSLATED_LOCALE],
    ...row.assemblies.map((assembly) => assembly.translations[TRANSLATED_LOCALE]),
  ]);

  return { canonical, id: row.id, key: catalogTranslationKey('product', row.id), kind: 'product', sourceHash, state };
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
  const sourceHash = productRangeSourceHash(canonical);
  const state = catalogTranslationState(sourceHash, [row.translations[TRANSLATED_LOCALE]]);
  return { canonical, id: row.id, key: catalogTranslationKey('range', row.id), kind: 'range', sourceHash, state };
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
  const sourceHash = productRangeVariantSourceHash(canonical);
  const state = catalogTranslationState(sourceHash, [row.translations[TRANSLATED_LOCALE]]);
  return { canonical, id: row.id, key: catalogTranslationKey('variant', row.id), kind: 'variant', sourceHash, state };
}

async function persistProductTranslation({
  db,
  source,
  translatedAt,
  translation,
}: PersistCatalogTranslationInput<'product'>): Promise<PersistCatalogTranslationResult> {
  const metadata = translationMetadata(source, translatedAt);

  return db.transaction(async (tx) => {
    const row = await tx.query.products.findFirst({
      where: and(eq(products.id, source.id), notRemoved(products)),
      with: { assemblies: { orderBy: [asc(productAssemblies.displayOrder), asc(productAssemblies.id)] } },
    });
    if (!row || toProductTranslationSource(row).sourceHash !== source.sourceHash) return 'skipped';

    const { assemblies, ...productTranslation } = translation;
    await tx
      .update(products)
      .set({ translations: mergeTranslation(products.translations, { ...metadata, ...productTranslation }) })
      .where(and(eq(products.id, source.id), notRemoved(products)));

    for (const assembly of assemblies) {
      await tx
        .update(productAssemblies)
        .set({
          translations: mergeTranslation(productAssemblies.translations, { ...metadata, name: assembly.name }),
        })
        .where(and(eq(productAssemblies.id, assembly.id), eq(productAssemblies.productId, source.id)));
    }

    return 'persisted';
  });
}

async function persistProductRangeTranslation({
  db,
  source,
  translatedAt,
  translation,
}: PersistCatalogTranslationInput<'range'>): Promise<PersistCatalogTranslationResult> {
  const metadata = translationMetadata(source, translatedAt);

  return db.transaction(async (tx) => {
    const row = await tx.query.productRanges.findFirst({
      where: and(eq(productRanges.id, source.id), notRemoved(productRanges)),
    });
    if (!row || toProductRangeTranslationSource(row).sourceHash !== source.sourceHash) return 'skipped';

    await tx
      .update(productRanges)
      .set({ translations: mergeTranslation(productRanges.translations, { ...metadata, ...translation }) })
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
  const metadata = translationMetadata(source, translatedAt);

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
      .limit(1);
    if (!row || toProductRangeVariantTranslationSource(row).sourceHash !== source.sourceHash) return 'skipped';

    await tx
      .update(productRangeVariants)
      .set({
        translations: mergeTranslation(productRangeVariants.translations, { ...metadata, ...translation }),
      })
      .where(and(eq(productRangeVariants.id, source.id), notRemoved(productRangeVariants)));

    return 'persisted';
  });
}

function translationMetadata(source: CatalogTranslationSource, translatedAt: Date): CatalogTranslationMetadata {
  return { sourceHash: source.sourceHash, translatedAt: translatedAt.toISOString() };
}

function mergeTranslation(
  column:
    | typeof productAssemblies.translations
    | typeof productRanges.translations
    | typeof productRangeVariants.translations
    | typeof products.translations,
  translation: CatalogTranslationMetadata &
    (
      | TranslatableAssemblyFields
      | TranslatableProductFields
      | TranslatableProductRangeFields
      | TranslatableProductRangeVariantFields
    ),
) {
  return sql`jsonb_set(${column}, array[${TRANSLATED_LOCALE}]::text[], ${JSON.stringify(translation)}::jsonb, true)`;
}
