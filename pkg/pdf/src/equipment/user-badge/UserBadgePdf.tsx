import { badgeScanToken } from '@pkg/domain/equipment';
import type { UserBadgePdfModel } from '@pkg/schema/equipment';
import { Document, StyleSheet } from '@react-pdf/renderer';

import { pdfTitleFontFamily } from '../../pdf-fonts.js';
import { LabelColumnText, LabelPage } from '../part-label/label-stock.js';

const NAME_STYLE = {
  fontFamily: pdfTitleFontFamily,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.3,
  lineHeight: 1.1,
} as const;

const styles = StyleSheet.create({
  title: {
    fontSize: 8,
    fontWeight: 700,
    lineHeight: 1.15,
    maxLines: 2,
  },
  caption: {
    fontSize: 7,
    lineHeight: 1.15,
    marginTop: 2,
    maxLines: 3,
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
        <LabelPage footer={{ style: NAME_STYLE, text: badge.name }} key={badge.id} payload={badgeScanToken(badge.id)}>
          {/* The card names a person, not a right — the printed line says so where it is read. */}
          <LabelColumnText style={styles.title}>Stores badge</LabelColumnText>
          <LabelColumnText style={styles.caption}>Scan to sign for stock</LabelColumnText>
        </LabelPage>
      ))}
    </Document>
  );
}
