import type { PartLabelPdfRenderer } from '@pkg/schema';
import { renderToBuffer } from '@react-pdf/renderer';

import { renderCode128DataUri } from './code128.js';
import { PartLabelPdf } from './PartLabelPdf.js';

export const renderPartLabelsPdf: PartLabelPdfRenderer = async ({ document }) => {
  const barcodeDataUris = await Promise.all(document.map((label) => renderCode128DataUri(label.code)));
  const buffer = await renderToBuffer(<PartLabelPdf barcodeDataUris={barcodeDataUris} labels={document} />);

  return new Uint8Array(buffer);
};
