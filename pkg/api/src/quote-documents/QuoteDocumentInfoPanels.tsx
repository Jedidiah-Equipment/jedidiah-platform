import type { QuoteDocumentModel } from '@pkg/schema';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { pdfStyles } from './pdf-styles.js';
import { pdfBorder, pdfColors, pdfSpacing } from './pdf-theme.js';

type QuoteDocumentInfoPanelsProps = {
  document: QuoteDocumentModel;
};

const layout = {
  bankPanelWidth: 166,
  panelMinHeight: 110,
  detailLabelWidth: 42,
  detailRowWidth: 176,
  detailRowWideWidth: 356,
} as const;

const styles = StyleSheet.create({
  infoGrid: {
    marginTop: pdfSpacing.section,
  },
  customerPanel: {
    borderColor: pdfColors.border,
    borderWidth: pdfBorder.defaultWidth,
    minHeight: layout.panelMinHeight,
  },
  bankPanel: {
    marginLeft: pdfSpacing.section,
    minHeight: layout.panelMinHeight,
    width: layout.bankPanelWidth,
  },
  eyebrow: {
    marginBottom: 2,
  },
  panelTitle: {
    marginBottom: 5,
  },
  detailGrid: {
    flexWrap: 'wrap',
  },
  detailRow: {
    borderBottomColor: '#e4e4e4',
    borderBottomWidth: pdfBorder.hairlineWidth,
    marginRight: 12,
    paddingBottom: 4,
    paddingTop: 4,
    width: layout.detailRowWidth,
  },
  detailRowWide: {
    width: layout.detailRowWideWidth,
  },
  detailLabel: {
    width: layout.detailLabelWidth,
  },
  mutedLine: {
    marginTop: 5,
  },
});

export function QuoteDocumentInfoPanels({ document }: QuoteDocumentInfoPanelsProps) {
  const customerLine =
    [document.customer.companyName, document.customer.contactPerson].flatMap((value) => toDisplayLines(value))[0] ?? '';
  const rows = [
    { label: 'Contact', value: document.customer.contactPerson },
    { label: 'Email', value: document.customer.email },
    { label: 'Phone', value: document.customer.phone },
    { label: 'VAT No.', value: document.customer.vatNumber },
    { label: 'Address', value: toDisplayLines(document.customer.address).join(', '), wide: true },
  ].filter((row) => Boolean(row.value?.trim()));

  return (
    <View style={[pdfStyles.flexRow, styles.infoGrid]}>
      <View style={[pdfStyles.flex1, pdfStyles.panelPadding, styles.customerPanel]}>
        <Text
          style={[pdfStyles.colorMuted, pdfStyles.fontBold, pdfStyles.textEyebrow, pdfStyles.uppercase, styles.eyebrow]}
        >
          Customer Details
        </Text>
        <Text style={[pdfStyles.fontBold, pdfStyles.textHeading, styles.panelTitle]}>{customerLine}</Text>
        <View style={[pdfStyles.flexRow, styles.detailGrid]}>
          {rows.map((row) => (
            <View
              key={row.label}
              style={
                row.wide
                  ? [pdfStyles.flexRow, styles.detailRow, styles.detailRowWide]
                  : [pdfStyles.flexRow, styles.detailRow]
              }
            >
              <Text
                style={[
                  pdfStyles.colorMutedDark,
                  pdfStyles.fontBold,
                  pdfStyles.textBodyXs,
                  pdfStyles.uppercase,
                  styles.detailLabel,
                ]}
              >
                {row.label}
              </Text>
              <Text style={[pdfStyles.flex1, pdfStyles.fontMedium, pdfStyles.textBodyXs]}>{row.value?.trim()}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={[pdfStyles.bgBlack, pdfStyles.colorWhite, pdfStyles.panelPadding, styles.bankPanel]}>
        <Text
          style={[
            pdfStyles.colorBrandYellow,
            pdfStyles.fontBold,
            pdfStyles.textEyebrow,
            pdfStyles.uppercase,
            styles.eyebrow,
          ]}
        >
          Banking Details
        </Text>
        <Text style={[pdfStyles.fontBold, pdfStyles.textHeading, styles.panelTitle]}>FNB</Text>
        <Text style={[pdfStyles.colorMutedOnDark, pdfStyles.textBodyLg, styles.mutedLine]}>Acc no: 62835496599</Text>
        <Text style={[pdfStyles.colorMutedOnDark, pdfStyles.textBodyLg, styles.mutedLine]}>Branch: 220-122</Text>
        <Text style={[pdfStyles.colorMutedOnDark, pdfStyles.textBodyLg, styles.mutedLine]}>
          Reference: {document.quoteCode}
        </Text>
      </View>
    </View>
  );
}

function toDisplayLines(value: string | null | undefined): string[] {
  return value
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}
