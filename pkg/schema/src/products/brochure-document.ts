import type { BrochureImageSlot } from './product.js';

// A single Brochure image slot rendered into the PDF: a base64 data URI of the stored image bytes plus
// the fit the renderer should apply. Null when the slot is empty, so the renderer can omit it and reflow.
export type BrochureDocumentImage = {
  dataUri: string;
  fit: 'contain' | 'cover';
} | null;

export type BrochureDocumentImages = Record<BrochureImageSlot, BrochureDocumentImage>;

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
};

// Renders a resolved Brochure model into PDF bytes. Mirrors {@link QuoteDocumentPdfRenderer}: a pure
// function the API injects so @pkg/core never imports @react-pdf/renderer.
export type BrochurePdfRenderer = (input: { document: BrochureDocumentModel; filename: string }) => Promise<Uint8Array>;
