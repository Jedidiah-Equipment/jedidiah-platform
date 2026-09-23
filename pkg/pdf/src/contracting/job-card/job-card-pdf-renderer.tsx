import type { JobCardPdfRenderer } from '@pkg/schema/contracting';
import { renderToBuffer } from '@react-pdf/renderer';

import { JobCardPdf } from './JobCardPdf.js';

export const renderJobCardPdf: JobCardPdfRenderer = async ({ document }) => {
  const buffer = await renderToBuffer(<JobCardPdf document={document} />);
  return new Uint8Array(buffer);
};
