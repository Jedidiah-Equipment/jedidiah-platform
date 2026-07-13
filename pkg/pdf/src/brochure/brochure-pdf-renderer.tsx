import type { BrochurePdfRenderer } from '@pkg/schema';
import { renderToBuffer } from '@react-pdf/renderer';

import { BrochureDocumentPdf } from './BrochureDocumentPdf.js';

export const renderBrochurePdf: BrochurePdfRenderer = async ({ document, locale = 'en' }) => {
  const buffer = await renderToBuffer(<BrochureDocumentPdf document={document} locale={locale} />);

  return new Uint8Array(buffer);
};
