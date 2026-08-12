import type { QuoteDocumentModel } from '@pkg/schema';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { pdfStyles } from './pdf-styles.js';
import { pdfBorder, pdfColors, pdfLineHeight, pdfSpacing } from './pdf-theme.js';

type QuoteDocumentInfoPanelsProps = {
  document: QuoteDocumentModel;
};

const styles = StyleSheet.create({
  customerStrip: {
    alignItems: 'flex-start',
    borderColor: pdfColors.border,
    borderWidth: pdfBorder.defaultWidth,
    marginTop: pdfSpacing.section,
    paddingHorizontal: pdfSpacing.tableCellX,
    paddingVertical: 6,
  },
  stripLabel: {
    marginRight: 10,
    width: 76,
  },
  details: {
    lineHeight: pdfLineHeight.body,
  },
});

export function QuoteDocumentInfoPanels({ document }: QuoteDocumentInfoPanelsProps) {
  const customerDetails = [
    formatDetailValue(document.customer.companyName),
    labelled('Contact', document.customer.contactPerson),
    labelled('Email', document.customer.email),
    labelled('Phone', document.customer.phone),
    labelled('VAT No.', document.customer.vatNumber),
    labelled('Address', document.customer.address),
  ].filter((value): value is string => value !== null);

  return (
    <View style={[pdfStyles.flexRow, styles.customerStrip]}>
      <Text
        style={[
          pdfStyles.colorMuted,
          pdfStyles.fontBold,
          pdfStyles.textEyebrow,
          pdfStyles.uppercase,
          styles.stripLabel,
        ]}
      >
        Customer Details
      </Text>
      <Text style={[pdfStyles.flex1, pdfStyles.fontMedium, pdfStyles.textBodyXs, styles.details]}>
        {customerDetails.join(' | ')}
      </Text>
    </View>
  );
}

function labelled(label: string, value: string | null | undefined): string | null {
  const displayValue = formatDetailValue(value);
  return displayValue === null ? null : `${label}: ${displayValue}`;
}

function formatDetailValue(value: string | null | undefined): string | null {
  if (!value) return null;

  const displayValue = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(', ');

  return displayValue || null;
}
