import type { PartLabelPdfModel } from '@pkg/schema';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import { pdfFontFamily, pdfTitleFontFamily } from '../pdf-fonts.js';

const POINTS_PER_MILLIMETRE = 72 / 25.4;

// Confirm this single hardware seam against the purchased printer and label stock before the go-live batch.
export const PART_LABEL_PAGE_SIZE = {
  height: 50 * POINTS_PER_MILLIMETRE,
  width: 100 * POINTS_PER_MILLIMETRE,
} as const;

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    color: '#000000',
    fontFamily: pdfFontFamily,
    paddingBottom: 10,
    paddingHorizontal: 17,
    paddingTop: 9,
  },
  barcode: {
    height: 50,
    marginBottom: 3,
    objectFit: 'fill',
    width: '100%',
  },
  code: {
    fontFamily: pdfTitleFontFamily,
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: 0.7,
    lineHeight: 1,
    textAlign: 'center',
  },
  name: {
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.1,
    marginTop: 4,
    textAlign: 'center',
  },
  location: {
    fontSize: 8,
    lineHeight: 1.1,
    marginTop: 3,
    textAlign: 'center',
  },
});

export type PartLabelRenderItem = {
  barcodeDataUri: string;
  label: PartLabelPdfModel;
};

export function PartLabelPdf({ items }: { items: PartLabelRenderItem[] }) {
  return (
    <Document title={items.length === 1 ? `Part label ${items[0]?.label.code ?? ''}` : 'Part labels'}>
      {items.map(({ barcodeDataUri, label }) => (
        <Page key={label.code} size={[PART_LABEL_PAGE_SIZE.width, PART_LABEL_PAGE_SIZE.height]} style={styles.page}>
          <View>
            <Image src={barcodeDataUri} style={styles.barcode} />
            <Text style={styles.code}>{label.code}</Text>
            <Text style={styles.name}>{label.name}</Text>
            <Text style={styles.location}>{label.storageLocation ?? 'Location not set'}</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
