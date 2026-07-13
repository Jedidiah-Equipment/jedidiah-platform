import type { Locale } from '../common/locale.js';
import type { BROCHURE_IMAGE_SLOTS } from './product.js';

// A single Brochure image slot rendered into the PDF: a base64 data URI of the stored image bytes plus
// the fit the renderer should apply. Null when the slot is empty, so the renderer can omit it and reflow.
export type BrochureDocumentImage = {
  dataUri: string;
  fit: 'contain' | 'cover';
} | null;

// Keyed by the brochure subset of Product image slots ({@link BROCHURE_IMAGE_SLOTS}); the extra Product
// image slots never reach the brochure model.
export type BrochureDocumentImages = Record<(typeof BROCHURE_IMAGE_SLOTS)[number], BrochureDocumentImage>;

// The fully resolved input model for the Brochure PDF renderer. Derived from a Product (title from the
// product name, body copy from its description, Standard/Optional assembly columns from its assemblies)
// plus the resolved Brochure Config image data URIs. The renderer is pure over this model; all reads,
// gating, and image fetching happen during assembly in @pkg/core.
export type BrochureDocumentModel = {
  bodyCopy: string[];
  images: BrochureDocumentImages;
  keyFeatures: string[];
  modelCode: string;
  optionalAssemblies: string[];
  // The top-right logo, resolved from the owning Product Range's image. Null when the Range has no image.
  rangeLogo: BrochureDocumentImage;
  standardAssemblies: string[];
  subtitle: string | null;
  title: string;
  // A substring of the title to accent on the cover; null leaves the whole title in the default colour.
  titleHighlight: string | null;
};

// Renders a resolved Brochure model into PDF bytes. Mirrors {@link QuoteDocumentPdfRenderer}: a pure
// function the API injects so @pkg/core never imports @react-pdf/renderer.
export type BrochurePdfRenderer = (input: {
  document: BrochureDocumentModel;
  filename: string;
  locale?: Locale;
}) => Promise<Uint8Array>;
