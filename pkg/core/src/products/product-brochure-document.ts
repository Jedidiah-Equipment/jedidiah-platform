import { randomUUID } from 'node:crypto';

import type { DatabaseTransaction, Db, ProductImageStore, StoredFile } from '@pkg/db';
import { evaluateProductBrochureCompleteness } from '@pkg/domain';
import {
  type AuthId,
  BROCHURE_IMAGE_SLOTS,
  type BrochureDocumentImage,
  type BrochureDocumentImages,
  type BrochureDocumentModel,
  type BrochurePdfRenderer,
  PRODUCT_IMAGE_SLOT_SPECS,
  type Product,
  type UUID,
} from '@pkg/schema';

import {
  createDocumentRecord,
  readStoredObjectBytes,
  sanitizeDocumentStorageKeySuffix,
} from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { ProductBrochureIncompleteError } from './product-errors.js';
import { getProductBrochureSource } from './product-service.js';

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
  pdfRenderer,
  productId,
  storage,
}: {
  db: Db;
  pdfRenderer: BrochurePdfRenderer;
  productId: UUID;
  storage: StorageAdapter;
}): Promise<BrochurePreviewResult> {
  const { images, product, rangeLogo } = await getProductBrochureSource({ db, id: productId });

  const completeness = evaluateProductBrochureCompleteness(product);

  if (!completeness.complete) {
    throw new ProductBrochureIncompleteError(productId, completeness.missingFields);
  }

  return renderBrochureForProduct({ images, pdfRenderer, product, rangeLogo, storage });
}

/**
 * Generates the Brochure PDF from a Product's live config when the completeness gate is met, or returns
 * null when it is not. Unlike {@link renderProductBrochurePreview}, an incomplete config is not an error
 * here: callers that fold the brochure into a larger packet (the Quote Document) treat an absent brochure
 * as a non-blocking skip and surface a warning instead of failing the whole generation.
 */
export async function generateProductBrochureIfComplete({
  db,
  includeRemoved = false,
  pdfRenderer,
  productId,
  storage,
}: {
  db: Db;
  includeRemoved?: boolean;
  pdfRenderer: BrochurePdfRenderer;
  productId: UUID;
  storage: StorageAdapter;
}): Promise<BrochurePreviewResult | null> {
  const { images, product, rangeLogo } = await getProductBrochureSource({ db, id: productId, includeRemoved });

  if (!evaluateProductBrochureCompleteness(product).complete) {
    return null;
  }

  return renderBrochureForProduct({ images, pdfRenderer, product, rangeLogo, storage });
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
  const brochure = await generateProductBrochureIfComplete({
    db,
    includeRemoved: true,
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
  pdfRenderer,
  product,
  rangeLogo,
  storage,
}: {
  images: ProductImageStore;
  pdfRenderer: BrochurePdfRenderer;
  product: Product;
  rangeLogo: StoredFile | null;
  storage: StorageAdapter;
}): Promise<BrochurePreviewResult> {
  const document = await getBrochureDocumentModel({ images, product, rangeLogo, storage });
  const filename = `${product.modelCode}-brochure.pdf`;
  const bytes = await pdfRenderer({ document, filename });

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
  product,
  rangeLogo: rangeLogoRef,
  storage,
}: {
  images: ProductImageStore;
  product: Product;
  rangeLogo: StoredFile | null;
  storage: StorageAdapter;
}): Promise<BrochureDocumentModel> {
  const [resolvedImages, rangeLogo] = await Promise.all([
    resolveBrochureImages({ store: images, storage }),
    // The Range logo fits without cropping, matching the old per-product range-logo slot.
    resolveStoredImage({ fit: 'contain', ref: rangeLogoRef, storage }),
  ]);

  return {
    bodyCopy: toDisplayLines(product.description),
    images: resolvedImages,
    keyFeatures: product.keyFeatures,
    modelCode: product.modelCode,
    optionalAssemblies: product.assemblies
      .filter((assembly) => assembly.kind === 'optional')
      .map((assembly) => assembly.name),
    rangeLogo,
    standardAssemblies: product.assemblies
      .filter((assembly) => assembly.kind === 'standard')
      .map((assembly) => assembly.name),
    subtitle: product.category,
    title: product.name,
    titleHighlight: product.nameHighlight,
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

// Reads a stored image's bytes and inlines them as a base64 data URI with the given render fit, or
// returns null when there is no image. Shared by the Brochure slots and the Range logo.
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
