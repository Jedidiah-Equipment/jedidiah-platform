import { StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';

import { pdfFontFamily, pdfTitleFontFamily } from './pdf-fonts.js';
import { pdfBorder, pdfColors, pdfFontSize, pdfFontWeight, pdfSpacing } from './pdf-theme.js';

export const documentFrameLayout = { pagePadding: 24, sectionGap: 8 } as const;

/** The frame the A4 business documents share; a document merges its own style after one of these. */
export const documentFrameStyles = StyleSheet.create({
  page: { color: pdfColors.black, fontFamily: pdfFontFamily, padding: documentFrameLayout.pagePadding },
  header: {
    alignItems: 'flex-start',
    backgroundColor: pdfColors.black,
    color: pdfColors.white,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: documentFrameLayout.sectionGap,
    padding: 18,
  },
  title: { fontFamily: pdfTitleFontFamily, fontSize: 24, fontWeight: pdfFontWeight.bold },
  businessDetails: { alignItems: 'flex-end', fontSize: pdfFontSize.eyebrow, gap: 2, textAlign: 'right' },
  businessName: { fontWeight: pdfFontWeight.bold },
  code: {
    color: pdfColors.yellow,
    fontFamily: pdfTitleFontFamily,
    fontSize: 18,
    fontWeight: pdfFontWeight.bold,
    marginBottom: 4,
  },
  metaGrid: { flexDirection: 'row', gap: 12, marginBottom: documentFrameLayout.sectionGap },
  panel: { backgroundColor: pdfColors.panel, flex: 1, padding: pdfSpacing.cardPadding },
  label: { color: pdfColors.muted, fontSize: pdfFontSize.eyebrow, marginBottom: 4, textTransform: 'uppercase' },
  line: { marginBottom: 2 },
  tableHeader: {
    backgroundColor: pdfColors.black,
    color: pdfColors.white,
    flexDirection: 'row',
    fontWeight: pdfFontWeight.bold,
    paddingHorizontal: pdfSpacing.tableCellX,
  },
  tableRow: {
    borderBottomColor: pdfColors.greyBorder,
    borderBottomWidth: pdfBorder.defaultWidth,
    paddingHorizontal: pdfSpacing.tableCellX,
  },
  footer: {
    color: pdfColors.muted,
    fontSize: pdfFontSize.eyebrow,
    gap: 2,
    left: documentFrameLayout.pagePadding,
    position: 'absolute',
    right: documentFrameLayout.pagePadding,
  },
});

/** The black band: the document's own lockup and title on the left, its number and business lines on the right. */
export function DocumentHeader({ lead, code, children }: { lead: ReactNode; code: string; children: ReactNode }) {
  return (
    <View style={documentFrameStyles.header}>
      <View>{lead}</View>
      <View style={documentFrameStyles.businessDetails}>
        <Text style={documentFrameStyles.code}>{code}</Text>
        {children}
      </View>
    </View>
  );
}

export function MetaPanel({ label, minHeight, children }: { label: string; minHeight?: number; children: ReactNode }) {
  return (
    <View style={minHeight === undefined ? documentFrameStyles.panel : [documentFrameStyles.panel, { minHeight }]}>
      <Text style={documentFrameStyles.label}>{label}</Text>
      {children}
    </View>
  );
}

/** Repeats on every page; `bottom` is the document's own distance from the page edge. */
export function DocumentFooter({ bottom, children }: { bottom: number; children: ReactNode }) {
  return (
    <View style={[documentFrameStyles.footer, { bottom }]} fixed>
      {children}
    </View>
  );
}
