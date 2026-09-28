import type { PartLabelPdfModel } from '@pkg/schema/equipment';
import { Document } from '@react-pdf/renderer';

import { pdfTitleFontFamily } from '../../pdf-fonts.js';
import { LabelPage } from './label-stock.js';

/** `PART_CODE_MAX_LENGTH` is what one line of this style holds across the label. */
export const PART_LABEL_CODE_STYLE = {
  fontFamily: pdfTitleFontFamily,
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.5,
  lineHeight: 1,
} as const;

const NAME_STYLE = { fontSize: 8, fontWeight: 700, lineHeight: 1.15, maxLines: 3 } as const;
const LOCATION_STYLE = { fontSize: 7, lineHeight: 1.15, marginTop: 2, maxLines: 2 } as const;

export function PartLabelPdf({ labels }: { labels: PartLabelPdfModel[] }) {
  return (
    <Document title={labels.length === 1 ? `Part label ${labels[0]?.code ?? ''}` : 'Part labels'}>
      {labels.map((label) => (
        <LabelPage
          column={{
            name: { style: NAME_STYLE, text: label.name },
            location: { style: LOCATION_STYLE, text: label.storageLocation ?? 'Location not set' },
          }}
          footer={{ style: PART_LABEL_CODE_STYLE, text: label.code }}
          key={label.code}
          payload={label.code}
        />
      ))}
    </Document>
  );
}
