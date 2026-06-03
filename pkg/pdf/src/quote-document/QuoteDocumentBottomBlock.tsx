import { formatCurrency } from '@pkg/domain';
import type { QuoteDocumentModel } from '@pkg/schema';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { pdfStyles } from './pdf-styles.js';
import { pdfBorder, pdfColors, pdfLineHeight, pdfSpacing } from './pdf-theme.js';

type QuoteDocumentBottomBlockProps = {
  document: QuoteDocumentModel;
};

const layout = {
  summaryAmountWidth: 122,
  summaryLabelWidth: 88,
  summaryPanelWidth: 210,
  termsLabelWidth: 94,
} as const;

const styles = StyleSheet.create({
  bottomGrid: {
    alignItems: 'flex-end',
    marginTop: 'auto',
    paddingTop: 16,
  },
  notesBox: {
    marginBottom: 8,
    paddingHorizontal: pdfSpacing.summaryCellX,
    paddingVertical: pdfSpacing.tableCellY,
  },
  notesText: {
    lineHeight: pdfLineHeight.body,
  },
  terms: {
    borderTopColor: pdfColors.border,
    borderTopWidth: pdfBorder.heavyWidth,
    paddingTop: 10,
  },
  termsRow: {
    marginBottom: pdfSpacing.section,
  },
  termsLabel: {
    width: layout.termsLabelWidth,
  },
  summary: {
    borderColor: pdfColors.border,
    borderWidth: pdfBorder.defaultWidth,
    marginLeft: 14,
    overflow: 'hidden',
    width: layout.summaryPanelWidth,
  },
  summaryLabel: {
    borderBottomColor: pdfColors.greyBorder,
    borderBottomWidth: pdfBorder.hairlineWidth,
    paddingHorizontal: pdfSpacing.summaryCellX,
    paddingVertical: pdfSpacing.summaryCellY,
    width: layout.summaryLabelWidth,
  },
  summaryAmount: {
    borderBottomColor: pdfColors.greyBorder,
    borderBottomWidth: pdfBorder.hairlineWidth,
    paddingHorizontal: pdfSpacing.summaryCellX,
    paddingVertical: pdfSpacing.summaryCellY,
    width: layout.summaryAmountWidth,
  },
  summaryTotalCell: {
    borderBottomWidth: 0,
  },
});

export function QuoteDocumentBottomBlock({ document }: QuoteDocumentBottomBlockProps) {
  return (
    <View style={[pdfStyles.flexRow, styles.bottomGrid]} wrap={false}>
      <View style={pdfStyles.flex1}>
        {document.notes.length > 0 ? <NotesBox notes={document.notes} /> : null}
        <View style={styles.terms}>
          <TermsRow label="Payment Terms:" value={document.paymentTerms} />
          <TermsRow label="Transport:" value={document.transport} />
          <TermsRow label="Lead Time:" value={document.leadTime} />
        </View>
      </View>
      <View style={styles.summary}>
        <SummaryRow label="Subtotal" value={formatCurrency(document.subtotal)} />
        <SummaryRow label="VAT" value={formatCurrency(document.vatAmount)} />
        <SummaryRow label="Total" total value={formatCurrency(document.total, document.currencyCode)} />
      </View>
    </View>
  );
}

function NotesBox({ notes }: { notes: string[] }) {
  return (
    <View style={[pdfStyles.bgPanel, styles.notesBox]}>
      {notes.map((note) => (
        <Text key={note} style={[pdfStyles.fontMedium, pdfStyles.textBody, styles.notesText]}>
          {note}
        </Text>
      ))}
    </View>
  );
}

function TermsRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={[pdfStyles.flexRow, styles.termsRow]}>
      <Text style={[pdfStyles.fontBold, pdfStyles.textBody, pdfStyles.uppercase, styles.termsLabel]}>{label}</Text>
      <Text style={[pdfStyles.fontBold, pdfStyles.textBodyLg]}>{value}</Text>
    </View>
  );
}

function SummaryRow({ label, total = false, value }: { label: string; total?: boolean; value: string }) {
  const labelStyle = total
    ? [
        pdfStyles.textBodyLg,
        styles.summaryLabel,
        pdfStyles.bgBlack,
        pdfStyles.colorWhite,
        pdfStyles.fontBold,
        pdfStyles.textHeading,
        styles.summaryTotalCell,
      ]
    : [pdfStyles.textBodyLg, styles.summaryLabel];
  const amountStyle = total
    ? [
        pdfStyles.bgPriceCell,
        pdfStyles.fontBold,
        pdfStyles.textBodyLg,
        pdfStyles.textRight,
        styles.summaryAmount,
        pdfStyles.bgBlack,
        pdfStyles.colorBrandYellow,
        pdfStyles.fontBold,
        pdfStyles.textHeading,
        styles.summaryTotalCell,
      ]
    : [pdfStyles.bgPriceCell, pdfStyles.fontBold, pdfStyles.textBodyLg, pdfStyles.textRight, styles.summaryAmount];

  return (
    <View style={pdfStyles.flexRow}>
      <Text style={labelStyle}>{label}</Text>
      <Text style={amountStyle}>{value}</Text>
    </View>
  );
}
