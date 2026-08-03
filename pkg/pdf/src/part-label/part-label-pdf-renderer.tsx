import type { PartLabelPdfRenderer } from '@pkg/schema';
import { renderToBuffer } from '@react-pdf/renderer';

import { renderCode128Barcode } from './code128.js';
import { PartLabelPdf } from './PartLabelPdf.js';

export const renderPartLabelsPdf: PartLabelPdfRenderer = async ({ document }) => {
  const items = await Promise.all(
    document.map(async (label) => {
      const barcode = await renderCode128Barcode(label.code);
      return { barcodeDataUri: barcode.dataUri, barcodeWidth: barcode.width, label };
    }),
  );
  const buffer = await renderToBuffer(<PartLabelPdf items={items} />);

  return new Uint8Array(buffer);
};
