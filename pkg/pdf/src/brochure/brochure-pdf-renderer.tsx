import type { BrochurePdfRenderer } from '@pkg/schema';
import { renderToBuffer } from '@react-pdf/renderer';

import { BrochureDocumentPdf } from './BrochureDocumentPdf.js';

export const renderBrochurePdf: BrochurePdfRenderer = async ({ document }) => {
  const buffer = await renderToBuffer(<BrochureDocumentPdf document={document} />);

  return new Uint8Array(buffer);
};
