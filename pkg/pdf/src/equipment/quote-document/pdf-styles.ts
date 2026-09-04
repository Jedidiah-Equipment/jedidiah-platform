import { StyleSheet } from '@react-pdf/renderer';

import { pdfBorder, pdfColors, pdfFontSize, pdfFontWeight, pdfSpacing } from './pdf-theme.js';

export const pdfStyles = StyleSheet.create({
  bgBlack: {
    backgroundColor: pdfColors.black,
  },
  bgBrandYellow: {
    backgroundColor: pdfColors.yellow,
  },
  bgPanel: {
    backgroundColor: pdfColors.panel,
  },
  bgPriceCell: {
    backgroundColor: pdfColors.priceCell,
  },
  borderDefault: {
    borderColor: pdfColors.border,
    borderWidth: pdfBorder.defaultWidth,
  },
  colorBlack: {
    color: pdfColors.black,
  },
  colorBrandYellow: {
    color: pdfColors.yellow,
  },
  colorMuted: {
    color: pdfColors.muted,
  },
  colorMutedDark: {
    color: pdfColors.mutedDark,
  },
  colorMutedOnDark: {
    color: pdfColors.mutedOnDark,
  },
  colorWhite: {
    color: pdfColors.white,
  },
  flex1: {
    flex: 1,
  },
  flexColumn: {
    flexDirection: 'column',
  },
  flexRow: {
    flexDirection: 'row',
  },
  fontBold: {
    fontWeight: pdfFontWeight.bold,
  },
  fontMedium: {
    fontWeight: pdfFontWeight.medium,
  },
  fontSemibold: {
    fontWeight: pdfFontWeight.semibold,
  },
  panelPadding: {
    padding: pdfSpacing.cardPadding,
  },
  textBody: {
    fontSize: pdfFontSize.body,
  },
  textBodyLg: {
    fontSize: pdfFontSize.bodyLg,
  },
  textBodyXs: {
    fontSize: pdfFontSize.bodyXs,
  },
  textEyebrow: {
    fontSize: pdfFontSize.eyebrow,
  },
  textHeading: {
    fontSize: pdfFontSize.heading,
  },
  textRight: {
    textAlign: 'right',
  },
  textTitle: {
    fontSize: pdfFontSize.title,
  },
  uppercase: {
    textTransform: 'uppercase',
  },
});
