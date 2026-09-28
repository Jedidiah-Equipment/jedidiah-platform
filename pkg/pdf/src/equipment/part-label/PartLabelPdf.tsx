import type { PartLabelPdfModel } from '@pkg/schema/equipment';
import { Document, StyleSheet, Text } from '@react-pdf/renderer';

import { pdfTitleFontFamily } from '../../pdf-fonts.js';
import { LabelPage, LabelQrSymbol, labelLineStyle } from './label-stock.js';

/** `PART_CODE_MAX_LENGTH` is what one line of this style holds across the label. */
export const PART_LABEL_CODE_STYLE = {
  fontFamily: pdfTitleFontFamily,
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 0.5,
} as const;

const styles = StyleSheet.create({
  code: {
    ...labelLineStyle,
    ...PART_LABEL_CODE_STYLE,
    lineHeight: 1,
  },
  name: {
    ...labelLineStyle,
    fontSize: 8,
    fontWeight: 700,
    lineHeight: 1.15,
    marginTop: 3,
  },
  location: {
    ...labelLineStyle,
    fontSize: 7,
    lineHeight: 1.15,
    marginTop: 2,
  },
});

export function PartLabelPdf({ labels }: { labels: PartLabelPdfModel[] }) {
  return (
    <Document title={labels.length === 1 ? `Part label ${labels[0]?.code ?? ''}` : 'Part labels'}>
      {labels.map((label) => (
        <LabelPage key={label.code}>
          <LabelQrSymbol payload={label.code} />
          <Text style={styles.code}>{label.code}</Text>
          <Text style={styles.name}>{label.name}</Text>
          <Text style={styles.location}>{label.storageLocation ?? 'Location not set'}</Text>
        </LabelPage>
      ))}
    </Document>
  );
}
