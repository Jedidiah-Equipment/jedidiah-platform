import { formatCurrency, formatDate } from '@pkg/domain';
import { PART_UNIT_OF_MEASURE_LABELS, type PurchaseOrderPdfModel } from '@pkg/schema';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import { pdfFontFamily, pdfTitleFontFamily } from '../pdf-fonts.js';
import { pdfColors } from '../quote-document/pdf-theme.js';

const styles = StyleSheet.create({
  page: {
    color: pdfColors.black,
    fontFamily: pdfFontFamily,
    fontSize: 9,
    padding: 36,
  },
  header: {
    alignItems: 'flex-end',
    backgroundColor: pdfColors.black,
    color: pdfColors.white,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    padding: 18,
  },
  title: { fontFamily: pdfTitleFontFamily, fontSize: 24, fontWeight: 700 },
  code: { color: pdfColors.yellow, fontFamily: pdfTitleFontFamily, fontSize: 18, fontWeight: 700 },
  metaGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  panel: { backgroundColor: pdfColors.panel, flex: 1, minHeight: 92, padding: 12 },
  label: { color: pdfColors.muted, fontSize: 7, marginBottom: 4, textTransform: 'uppercase' },
  strong: { fontWeight: 700, marginBottom: 3 },
  line: { marginBottom: 2 },
  tableHeader: {
    backgroundColor: pdfColors.black,
    color: pdfColors.white,
    flexDirection: 'row',
    fontWeight: 700,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  tableRow: {
    borderBottomColor: pdfColors.greyBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  description: { flex: 1 },
  quantity: { textAlign: 'right', width: 92 },
  money: { textAlign: 'right', width: 82 },
  total: {
    alignSelf: 'flex-end',
    backgroundColor: pdfColors.yellowLight,
    flexDirection: 'row',
    fontWeight: 700,
    marginTop: 12,
    padding: 10,
    width: 180,
  },
  totalLabel: { flex: 1 },
  totalValue: { textAlign: 'right' },
  footer: { bottom: 22, color: pdfColors.muted, fontSize: 7, left: 36, position: 'absolute', right: 36 },
});

export function PurchaseOrderPdf({ document }: { document: PurchaseOrderPdfModel }) {
  // The as-sent record always prints real prices: it is rendered from the core read, never the gated view.
  const total = document.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  return (
    <Document title={document.code}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>PURCHASE ORDER</Text>
          <Text style={styles.code}>
            {document.revision > 1 ? `${document.code} REV ${document.revision}` : document.code}
          </Text>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.panel}>
            <Text style={styles.label}>Supplier</Text>
            <Text style={styles.strong}>{document.supplier.companyName}</Text>
            {document.supplier.contactPerson ? (
              <Text style={styles.line}>{document.supplier.contactPerson}</Text>
            ) : null}
            {document.supplier.address ? <Text style={styles.line}>{document.supplier.address}</Text> : null}
            {document.supplier.email ? <Text style={styles.line}>{document.supplier.email}</Text> : null}
            {document.supplier.phone ? <Text style={styles.line}>{document.supplier.phone}</Text> : null}
          </View>
          <View style={styles.panel}>
            <Text style={styles.label}>Order details</Text>
            <Text style={styles.line}>Issued: {formatDate(document.issueDate, 'd MMMM yyyy')}</Text>
            {document.revision > 1 ? (
              <Text style={styles.line}>{`Revision ${document.revision} - supersedes all earlier revisions`}</Text>
            ) : null}
            <Text style={styles.line}>
              Expected: {formatDate(document.expectedDeliveryDate, 'd MMMM yyyy', 'Not specified')}
            </Text>
            <Text style={styles.label}>Linked Jobs</Text>
            <Text>{document.jobCodes.length > 0 ? document.jobCodes.join(', ') : 'Restock - no linked Job'}</Text>
          </View>
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={styles.description}>Part</Text>
          <Text style={styles.quantity}>Quantity</Text>
          <Text style={styles.money}>Unit price</Text>
          <Text style={styles.money}>Subtotal</Text>
        </View>
        {document.lines.map((line) => (
          <View key={line.partId} style={styles.tableRow} wrap={false}>
            <View style={styles.description}>
              <Text style={styles.strong}>{`${line.partCode} - ${line.partName}`}</Text>
              {line.supplierCode ? <Text style={styles.line}>Supplier code: {line.supplierCode}</Text> : null}
            </View>
            <Text style={styles.quantity}>{formatLineQuantity(line)}</Text>
            <Text style={styles.money}>{formatCurrency(line.unitPrice, 'ZAR')}</Text>
            <Text style={styles.money}>{formatCurrency(line.quantity * line.unitPrice, 'ZAR')}</Text>
          </View>
        ))}

        <View style={styles.total}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(total, 'ZAR')}</Text>
        </View>
        <Text style={styles.footer} fixed>
          Prices are in South African rand (ZAR). Please quote {document.code} on correspondence and invoices.
        </Text>
      </Page>
    </Document>
  );
}

function formatLineQuantity(line: PurchaseOrderPdfModel['lines'][number]): string {
  if (line.unitOfMeasure === 'mm' && line.standardPurchaseLengthMm !== null) {
    return `${line.quantity} x ${line.standardPurchaseLengthMm} mm`;
  }
  return `${line.quantity} ${PART_UNIT_OF_MEASURE_LABELS[line.unitOfMeasure]}`;
}
