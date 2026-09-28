import { badgeScanToken } from '@pkg/domain/equipment';
import type { UserBadgePdfModel } from '@pkg/schema/equipment';
import { Document, StyleSheet, Text } from '@react-pdf/renderer';

import { pdfTitleFontFamily } from '../../pdf-fonts.js';
import { LabelPage, LabelQrSymbol, labelLineStyle } from '../part-label/label-stock.js';

const styles = StyleSheet.create({
  name: {
    ...labelLineStyle,
    fontFamily: pdfTitleFontFamily,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.3,
    lineHeight: 1.1,
    marginTop: 4,
  },
  caption: {
    ...labelLineStyle,
    fontSize: 6,
    lineHeight: 1.15,
    marginTop: 4,
  },
});

/**
 * The symbol carries `badge:<userId>` rather than the bare id: one scan field takes both Part labels and
 * badges, and the prefix is what tells them apart (`parseScanToken` in `@pkg/domain` owns both ends).
 */
export function UserBadgePdf({ badges }: { badges: UserBadgePdfModel[] }) {
  return (
    <Document title={badges.length === 1 ? `Stores badge ${badges[0]?.name ?? ''}` : 'Stores badges'}>
      {badges.map((badge) => (
        <LabelPage key={badge.id}>
          <LabelQrSymbol payload={badgeScanToken(badge.id)} />
          <Text style={styles.name}>{badge.name}</Text>
          {/* The card names a person, not a right — the printed line says so where it is read. */}
          <Text style={styles.caption}>Stores badge · scan to sign for stock</Text>
        </LabelPage>
      ))}
    </Document>
  );
}
