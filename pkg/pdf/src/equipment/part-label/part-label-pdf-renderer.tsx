import type { PartLabelPdfRenderer } from '@pkg/schema/equipment';
import { renderToBuffer } from '@react-pdf/renderer';

import { PartLabelPdf } from './PartLabelPdf.js';

export const renderPartLabelsPdf: PartLabelPdfRenderer = async ({ document }) => {
  const buffer = await renderToBuffer(<PartLabelPdf labels={document} />);

  return new Uint8Array(buffer);
};
