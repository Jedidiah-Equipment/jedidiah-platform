import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction, Db, ProductImageStore, StoredFile } from '@pkg/db';
import { evaluateProductBrochureCompleteness, localizeFields } from '@pkg/domain';
import {
  type AssemblyKind,
  type AuthId,
  BROCHURE_IMAGE_SLOTS,
  type BrochureDocumentImage,
  type BrochureDocumentImages,
  type BrochureDocumentModel,
  type BrochurePdfRenderer,
  type Locale,
  PRODUCT_IMAGE_SLOT_SPECS,
  type Product,
  type UUID,
} from '@pkg/schema';
import sharp from 'sharp';

import {
  createDocumentRecord,
  readStoredObjectBytes,
  sanitizeDocumentStorageKeySuffix,
} from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { ProductBrochureIncompleteError } from './product-errors.js';
import { getHistoricalProductBrochureSource, getProductBrochureSource } from './product-service.js';

export type BrochurePreviewResult = {
  bytes: Uint8Array;
  filename: string;
};

/**
 * Renders the on-the-fly Brochure preview PDF for a Product WITHOUT persisting it. Gated on the shared
 * completeness predicate: an incomplete brochure throws {@link ProductBrochureIncompleteError} rather
 * than producing a partial document. The PDF renderer is injected so @pkg/core never imports react-pdf.
 */
export async function renderProductBrochurePreview({
  db,
  locale = 'en',
  pdfRenderer,
  productId,
  storage,
}: {
  db: Db;
  locale?: Locale;
  pdfRenderer: BrochurePdfRenderer;
  productId: UUID;
  storage: StorageAdapter;
}): Promise<BrochurePreviewResult> {
  const { images, product, rangeLogo } = await getProductBrochureSource({ db, id: productId });

  const completeness = evaluateProductBrochureCompleteness(product);

  if (!completeness.complete) {
    throw new ProductBrochureIncompleteError(productId, completeness.missingFields);
  }

  return renderBrochureForProduct({ images, locale, pdfRenderer, product, rangeLogo, storage });
}

/**
 * Generates the Brochure PDF from a Product's live config when the completeness gate is met, or returns
 * null when it is not. Unlike {@link renderProductBrochurePreview}, an incomplete config is not an error
 * here: callers that fold the brochure into a larger packet (the Quote Document) treat an absent brochure
 * as a non-blocking skip and surface a warning instead of failing the whole generation.
 */
export async function generateProductBrochureIfComplete({
  db,
  locale = 'en',
  pdfRenderer,
  productId,
  storage,
}: {
  db: Db;
  locale?: Locale;
  pdfRenderer: BrochurePdfRenderer;
  productId: UUID;
  storage: StorageAdapter;
}): Promise<BrochurePreviewResult | null> {
  const { images, product, rangeLogo } = await getProductBrochureSource({ db, id: productId });

  if (!evaluateProductBrochureCompleteness(product).complete) {
    return null;
  }

  return renderBrochureForProduct({ images, locale, pdfRenderer, product, rangeLogo, storage });
}

/**
 * Generates a brochure for immutable Quote/Job document packets from the referenced Product row, even
 * after that Product has been removed from active catalog flows.
 */
export async function generateHistoricalProductBrochureIfComplete({
  db,
  locale = 'en',
  pdfRenderer,
  productId,
  storage,
}: {
  db: Db;
  locale?: Locale;
  pdfRenderer: BrochurePdfRenderer;
  productId: UUID;
  storage: StorageAdapter;
}): Promise<BrochurePreviewResult | null> {
  const { images, product, rangeLogo } = await getHistoricalProductBrochureSource({ db, id: productId });

  if (!evaluateProductBrochureCompleteness(product).complete) {
    return null;
  }

  return renderBrochureForProduct({ images, locale, pdfRenderer, product, rangeLogo, storage });
}

/**
 * Generates the Brochure from a Product's live config and saves it as a standalone immutable Job
 * Document. When the config is incomplete, nothing is created — consistent with the shared completeness
 * gate, so a job with an unconfigured brochure simply has no brochure document. The PDF is generated
 * fresh and persisted at creation time, so a later edit to the Product's brochure config never changes
 * an already-saved Job Document.
 *
 * The config read uses `db` (the Product and its images are untouched by the job-create transaction),
 * while the document row is inserted on `tx` so it commits atomically with the rest of job creation.
 */
export async function snapshotJobBrochureDocument({
  actorUserId,
  db,
  jobId,
  pdfRenderer,
  productId,
  storage,
  tx,
}: {
  actorUserId: AuthId;
  db: Db;
  jobId: UUID;
  pdfRenderer: BrochurePdfRenderer;
  productId: UUID;
  storage: StorageAdapter;
  tx: DatabaseTransaction;
}): Promise<void> {
  const brochure = await generateHistoricalProductBrochureIfComplete({
    db,
    pdfRenderer,
    productId,
    storage,
  });

  if (!brochure) {
    return;
  }

  const storageKey = `documents/job/${jobId}/${randomUUID()}-${sanitizeDocumentStorageKeySuffix(brochure.filename)}`;
  await createDocumentRecord({
    actorUserId,
    db: tx,
    input: {
      bytes: brochure.bytes,
      filename: brochure.filename,
      jobId,
      metadata: { type: 'brochure' },
      ownerType: 'job',
      sourceProductId: productId,
      storageKey,
    },
    storage,
  });
}

async function renderBrochureForProduct({
  images,
  locale,
  pdfRenderer,
  product,
  rangeLogo,
  storage,
}: {
  images: ProductImageStore;
  locale: Locale;
  pdfRenderer: BrochurePdfRenderer;
  product: Product;
  rangeLogo: StoredFile | null;
  storage: StorageAdapter;
}): Promise<BrochurePreviewResult> {
  const document = await getBrochureDocumentModel({ images, locale, product, rangeLogo, storage });
  const filename = `${product.modelCode}-brochure${locale === 'en' ? '' : `-${locale}`}.pdf`;
  const bytes = await pdfRenderer({ document, filename, locale });

  return { bytes, filename };
}

/**
 * Assembles the renderer input model from a Product read plus its stored Brochure images and the owning
 * Range's image. The title comes from the product name, body copy from the description (one paragraph per
 * non-empty line), the Standard/Optional columns from the product's assemblies, and the top-right logo
 * from the Range image. Image bytes are read from object storage and inlined as data URIs so the renderer
 * stays a pure function over the model.
 */
export async function getBrochureDocumentModel({
  images,
  locale = 'en',
  product,
  rangeLogo: rangeLogoRef,
  storage,
}: {
  images: ProductImageStore;
  locale?: Locale;
  product: Product;
  rangeLogo: StoredFile | null;
  storage: StorageAdapter;
}): Promise<BrochureDocumentModel> {
  const [resolvedImages, rangeLogo] = await Promise.all([
    resolveBrochureImages({ store: images, storage }),
    resolveRangeLogo({ ref: rangeLogoRef, storage }),
  ]);
  const localized = localizeFields(
    {
      category: product.category,
      description: product.description,
      keyFeatures: product.keyFeatures,
      name: product.name,
      nameHighlight: product.nameHighlight,
    },
    product.translations,
    locale,
  );
  const assemblyNames = (kind: AssemblyKind) =>
    product.assemblies
      .filter((assembly) => assembly.kind === kind)
      .map((assembly) => localizeFields({ name: assembly.name }, assembly.translations, locale).name);

  return {
    bodyCopy: toDisplayLines(localized.description),
    images: resolvedImages,
    keyFeatures: localized.keyFeatures,
    modelCode: product.modelCode,
    optionalAssemblies: assemblyNames('optional'),
    rangeLogo,
    standardAssemblies: assemblyNames('standard'),
    subtitle: localized.category,
    title: localized.name,
    titleHighlight: localized.nameHighlight,
  };
}

async function resolveBrochureImages({
  store,
  storage,
}: {
  store: ProductImageStore;
  storage: StorageAdapter;
}): Promise<BrochureDocumentImages> {
  const entries = await Promise.all(
    BROCHURE_IMAGE_SLOTS.map(
      async (slot) =>
        [
          slot,
          await resolveStoredImage({ fit: PRODUCT_IMAGE_SLOT_SPECS[slot].fit, ref: store[slot], storage }),
        ] as const,
    ),
  );

  return Object.fromEntries(entries) as BrochureDocumentImages;
}

async function resolveRangeLogo({
  ref,
  storage,
}: {
  ref: StoredFile | null;
  storage: StorageAdapter;
}): Promise<BrochureDocumentImage> {
  if (!ref) {
    return null;
  }

  const bytes = await readStoredObjectBytes(storage, ref.storageKey);
  const normalizedBytes = await trimExcessRangeLogoPadding(bytes);
  const dataUri = `data:${ref.contentType};base64,${Buffer.from(normalizedBytes).toString('base64')}`;

  return { dataUri, fit: 'contain' };
}

async function trimExcessRangeLogoPadding(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const metadata = await sharp(bytes).metadata();

    if (!metadata.height || !metadata.width) {
      return bytes;
    }

    const backgroundPixel = await sharp(bytes)
      .ensureAlpha()
      .extract({ height: 1, left: 0, top: 0, width: 1 })
      .raw()
      .toBuffer();
    const [red = 0, green = 0, blue = 0, alpha = 255] = backgroundPixel;
    const hasTrimmableBackground = alpha <= 10 || Math.min(red, green, blue) >= 240;

    if (!hasTrimmableBackground) {
      return bytes;
    }

    const trimmed = await sharp(bytes).trim({ lineArt: true }).toBuffer({ resolveWithObject: true });
    const hasExcessVerticalPadding = trimmed.info.height <= metadata.height * 0.5;

    // Only collapse strongly vertical padding. Square badge backgrounds are part of their logo artwork
    // and must keep their canvas rather than being cropped down to their lettering.
    return hasExcessVerticalPadding ? trimmed.data : bytes;
  } catch {
    // Normalization is best-effort; an image React-PDF previously accepted must not block the brochure.
    return bytes;
  }
}

async function resolveStoredImage({
  fit,
  ref,
  storage,
}: {
  fit: 'contain' | 'cover';
  ref: StoredFile | undefined | null;
  storage: StorageAdapter;
}): Promise<BrochureDocumentImage> {
  if (!ref) {
    return null;
  }

  const bytes = await readStoredObjectBytes(storage, ref.storageKey);
  const dataUri = `data:${ref.contentType};base64,${Buffer.from(bytes).toString('base64')}`;

  return { dataUri, fit };
}

function toDisplayLines(value: string | null | undefined): string[] {
  return value
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}
