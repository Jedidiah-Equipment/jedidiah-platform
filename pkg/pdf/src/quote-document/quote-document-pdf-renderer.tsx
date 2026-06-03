import type { QuoteDocumentPdfRenderer } from '@pkg/schema';
import { renderToBuffer } from '@react-pdf/renderer';

import { QuoteDocumentPdf } from './QuoteDocumentPdf.js';

export const renderQuoteDocumentPdf: QuoteDocumentPdfRenderer = async ({ document }) => {
  const buffer = await renderToBuffer(<QuoteDocumentPdf document={document} />);

  return new Uint8Array(buffer);
};
