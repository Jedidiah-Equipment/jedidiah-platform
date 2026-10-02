import { formatDate } from '@pkg/domain';
import {
  formatPurchaseOrderLineLabel,
  JEDIDIAH_BUSINESS_DETAILS,
  JEDIDIAH_PURCHASE_ORDER_CONTACTS,
} from '@pkg/domain/equipment';
import { PART_UNIT_OF_MEASURE_LABELS, type PurchaseOrderPdfModel } from '@pkg/schema/equipment';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import { DocumentFooter, DocumentHeader, documentFrameStyles, MetaPanel } from '../../document-frame.js';
import { jedidiahLogoSrc } from '../../pdf-logo.js';
import { pdfFontSize } from '../../pdf-theme.js';

const styles = StyleSheet.create({
  page: { fontSize: pdfFontSize.body },
  // Sized to render at the same width as the logo on the Quote document.
  logo: { height: 29, marginBottom: 10, objectFit: 'contain', width: 132 },
  strong: { fontWeight: 700, marginBottom: 3 },
  tableHeader: { paddingVertical: 7 },
  tableRow: { flexDirection: 'row', paddingVertical: 9 },
  description: { flex: 1 },
  quantity: { textAlign: 'right', width: 92 },
});

export function PurchaseOrderPdf({ document }: { document: PurchaseOrderPdfModel }) {
  return (
    <Document title={document.code}>
      <Page size="A4" style={[documentFrameStyles.page, styles.page]}>
        <DocumentHeader
          code={document.revision > 1 ? `${document.code} REV ${document.revision}` : document.code}
          lead={
            <>
              <Image src={jedidiahLogoSrc} style={styles.logo} />
              <Text style={documentFrameStyles.title}>PURCHASE ORDER</Text>
            </>
          }
        >
          <Text style={documentFrameStyles.businessName}>{JEDIDIAH_BUSINESS_DETAILS.registeredName}</Text>
          <Text>{`VAT registration: ${JEDIDIAH_BUSINESS_DETAILS.vatRegistrationNumber}`}</Text>
          <Text>{`Company registration: ${JEDIDIAH_BUSINESS_DETAILS.companyRegistrationNumber}`}</Text>
          <Text>{`Address: ${JEDIDIAH_BUSINESS_DETAILS.address}`}</Text>
          <Text>{`Email: ${JEDIDIAH_BUSINESS_DETAILS.partsEmail}`}</Text>
          {JEDIDIAH_PURCHASE_ORDER_CONTACTS.map((person) => (
            <Text key={person.name}>{`${person.name}: ${person.cellphone}`}</Text>
          ))}
        </DocumentHeader>

        <View style={documentFrameStyles.metaGrid}>
          <MetaPanel label="Supplier" minHeight={92}>
            <Text style={styles.strong}>{document.supplier.companyName}</Text>
            {document.supplier.contactPerson ? (
              <Text style={documentFrameStyles.line}>{document.supplier.contactPerson}</Text>
            ) : null}
            {document.supplier.address ? (
              <Text style={documentFrameStyles.line}>{document.supplier.address}</Text>
            ) : null}
            {document.supplier.email ? <Text style={documentFrameStyles.line}>{document.supplier.email}</Text> : null}
            {document.supplier.phone ? <Text style={documentFrameStyles.line}>{document.supplier.phone}</Text> : null}
          </MetaPanel>
          <MetaPanel label="Order details" minHeight={92}>
            <Text style={documentFrameStyles.line}>Issued: {formatDate(document.issueDate, 'long')}</Text>
            {document.revision > 1 ? (
              <Text style={documentFrameStyles.line}>
                {`Revision ${document.revision} - supersedes all earlier revisions`}
              </Text>
            ) : null}
            <Text style={documentFrameStyles.line}>
              Expected: {formatDate(document.expectedDeliveryDate, 'long', 'Not specified')}
            </Text>
            <Text style={documentFrameStyles.label}>Linked Jobs</Text>
            <Text>{document.jobCodes.length > 0 ? document.jobCodes.join(', ') : 'Restock - no linked Job'}</Text>
          </MetaPanel>
        </View>

        <View style={[documentFrameStyles.tableHeader, styles.tableHeader]} fixed>
          <Text style={styles.description}>Item</Text>
          <Text style={styles.quantity}>Quantity</Text>
        </View>
        {document.lines.map((line) => (
          <View key={line.id} style={[documentFrameStyles.tableRow, styles.tableRow]} wrap={false}>
            <View style={styles.description}>
              <Text style={styles.strong}>{formatPurchaseOrderLineLabel(line)}</Text>
              {line.supplierCode ? (
                <Text style={documentFrameStyles.line}>Supplier code: {line.supplierCode}</Text>
              ) : null}
            </View>
            <Text style={styles.quantity}>{formatLineQuantity(line)}</Text>
          </View>
        ))}

        <DocumentFooter bottom={22}>
          <Text>{`Last modified by ${document.lastModified.actorName ?? 'System'} on ${formatDate(
            document.lastModified.occurredAt,
            'long',
          )}`}</Text>
          <Text>{`Please quote ${document.code} on correspondence and invoices.`}</Text>
        </DocumentFooter>
      </Page>
    </Document>
  );
}

function formatLineQuantity(line: PurchaseOrderPdfModel['lines'][number]): string {
  if (line.kind === 'custom') return `${line.quantity} ${line.unit}`;
  if (line.unitOfMeasure === 'mm' && line.standardPurchaseLengthMm !== null) {
    return `${line.quantity} x ${line.standardPurchaseLengthMm} mm`;
  }
  return `${line.quantity} ${PART_UNIT_OF_MEASURE_LABELS[line.unitOfMeasure]}`;
}
