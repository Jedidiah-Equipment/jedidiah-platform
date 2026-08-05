import type { UserBadgePdfModel } from '@pkg/schema';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import { pdfFontFamily, pdfTitleFontFamily } from '../pdf-fonts.js';

const POINTS_PER_MILLIMETRE = 72 / 25.4;

/**
 * The same 100 by 50 millimetre stock the Part labels print on, so the shop buys and loads one
 * consumable. Confirm against the purchased printer before the go-live batch, exactly as there.
 */
export const USER_BADGE_PAGE_SIZE = {
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
    alignSelf: 'center',
    height: 50,
    marginBottom: 3,
    maxWidth: '100%',
    objectFit: 'contain',
  },
  name: {
    fontFamily: pdfTitleFontFamily,
    fontSize: 17,
    fontWeight: 700,
    height: 22,
    letterSpacing: 0.4,
    lineHeight: 1,
    overflow: 'hidden',
    textAlign: 'center',
  },
  caption: {
    fontSize: 8,
    lineHeight: 1.1,
    marginTop: 5,
    textAlign: 'center',
  },
});

export type UserBadgeRenderItem = {
  barcodeDataUri: string;
  barcodeWidth: number;
  badge: UserBadgePdfModel;
};

export function UserBadgePdf({ items }: { items: UserBadgeRenderItem[] }) {
  return (
    <Document title={items.length === 1 ? `Stores badge ${items[0]?.badge.name ?? ''}` : 'Stores badges'}>
      {items.map(({ badge, barcodeDataUri, barcodeWidth }) => (
        <Page key={badge.id} size={[USER_BADGE_PAGE_SIZE.width, USER_BADGE_PAGE_SIZE.height]} style={styles.page}>
          <View wrap={false}>
            <Image src={barcodeDataUri} style={[styles.barcode, { width: barcodeWidth }]} />
            <Text style={styles.name}>{badge.name}</Text>
            {/* The card names a person, not a right — the printed line says so where it is read. */}
            <Text style={styles.caption}>Stores badge · scan to sign for stock</Text>
          </View>
        </Page>
      ))}
    </Document>
  );
}
