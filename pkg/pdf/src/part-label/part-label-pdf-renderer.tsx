import type { PartLabelPdfRenderer } from '@pkg/schema';
import { renderToBuffer } from '@react-pdf/renderer';

import { renderCode128DataUri } from './code128.js';
import { PartLabelPdf } from './PartLabelPdf.js';

export const renderPartLabelsPdf: PartLabelPdfRenderer = async ({ document }) => {
  const items = await Promise.all(
    document.map(async (label) => ({ barcodeDataUri: await renderCode128DataUri(label.code), label })),
  );
  const buffer = await renderToBuffer(<PartLabelPdf items={items} />);

  return new Uint8Array(buffer);
};
