import { formatDate } from '@pkg/domain';
import { JEDIDIAH_BUSINESS_DETAILS } from '@pkg/domain/equipment';
import { PART_UNIT_OF_MEASURE_LABELS, type PurchaseOrderPdfModel } from '@pkg/schema/equipment';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import { pdfFontFamily, pdfTitleFontFamily } from '../../pdf-fonts.js';
import { jedidiahLogoSrc } from '../../pdf-logo.js';
import { pdfColors } from '../quote-document/pdf-theme.js';

const layout = { pagePadding: 24, sectionGap: 8 } as const;

const styles = StyleSheet.create({
  page: {
    color: pdfColors.black,
    fontFamily: pdfFontFamily,
    fontSize: 9,
    padding: layout.pagePadding,
  },
  header: {
    alignItems: 'flex-start',
    backgroundColor: pdfColors.black,
    color: pdfColors.white,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: layout.sectionGap,
    padding: 18,
  },
  // Sized to render at the same width as the logo on the Quote document.
  logo: { height: 29, marginBottom: 10, objectFit: 'contain', width: 132 },
  title: { fontFamily: pdfTitleFontFamily, fontSize: 24, fontWeight: 700 },
  businessDetails: { alignItems: 'flex-end', fontSize: 7, gap: 2, textAlign: 'right' },
  businessName: { fontWeight: 700 },
  code: {
    color: pdfColors.yellow,
    fontFamily: pdfTitleFontFamily,
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 4,
  },
  metaGrid: { flexDirection: 'row', gap: 12, marginBottom: layout.sectionGap },
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
  footer: {
    bottom: 22,
    color: pdfColors.muted,
    fontSize: 7,
    gap: 2,
    left: layout.pagePadding,
    position: 'absolute',
    right: layout.pagePadding,
  },
});

export function PurchaseOrderPdf({ document }: { document: PurchaseOrderPdfModel }) {
  return (
    <Document title={document.code}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Image src={jedidiahLogoSrc} style={styles.logo} />
            <Text style={styles.title}>PURCHASE ORDER</Text>
          </View>
          <View style={styles.businessDetails}>
            <Text style={styles.code}>
              {document.revision > 1 ? `${document.code} REV ${document.revision}` : document.code}
            </Text>
            <Text style={styles.businessName}>{JEDIDIAH_BUSINESS_DETAILS.registeredName}</Text>
            <Text>{`VAT registration: ${JEDIDIAH_BUSINESS_DETAILS.vatRegistrationNumber}`}</Text>
            <Text>{`Company registration: ${JEDIDIAH_BUSINESS_DETAILS.companyRegistrationNumber}`}</Text>
            <Text>{`Address: ${JEDIDIAH_BUSINESS_DETAILS.address}`}</Text>
            <Text>{`Email: ${JEDIDIAH_BUSINESS_DETAILS.email}`}</Text>
            <Text>{`Cell: ${JEDIDIAH_BUSINESS_DETAILS.cellphone}`}</Text>
          </View>
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
        </View>
        {document.lines.map((line) => (
          <View key={line.partId} style={styles.tableRow} wrap={false}>
            <View style={styles.description}>
              <Text style={styles.strong}>{`${line.partCode} - ${line.partName}`}</Text>
              {line.supplierCode ? <Text style={styles.line}>Supplier code: {line.supplierCode}</Text> : null}
            </View>
            <Text style={styles.quantity}>{formatLineQuantity(line)}</Text>
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>{`Last modified by ${document.lastModified.actorName ?? 'System'} on ${formatDate(
            document.lastModified.occurredAt,
            'd MMMM yyyy',
          )}`}</Text>
          <Text>{`Please quote ${document.code} on correspondence and invoices.`}</Text>
        </View>
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
