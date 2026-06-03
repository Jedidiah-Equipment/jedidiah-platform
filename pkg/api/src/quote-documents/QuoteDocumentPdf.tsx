import type { QuoteDocumentModel } from '@pkg/schema';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import { pdfBorder, pdfColors, pdfLineHeight, pdfSpacing } from './pdf-theme.js';
import { QuoteDocumentBottomBlock } from './QuoteDocumentBottomBlock.js';
import { QuoteDocumentHeader } from './QuoteDocumentHeader.js';
import { QuoteDocumentInfoPanels } from './QuoteDocumentInfoPanels.js';
import { QuoteDocumentLineItemsTable } from './QuoteDocumentLineItemsTable.js';

type QuoteDocumentPdfProps = {
  document: QuoteDocumentModel;
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: pdfColors.white,
    color: pdfColors.black,
    fontFamily: 'Helvetica',
    fontSize: 8,
    lineHeight: pdfLineHeight.page,
    padding: pdfSpacing.pagePadding,
  },
  sheet: {
    flexDirection: 'column',
    minHeight: '100%',
  },
  footerNote: {
    borderTopColor: pdfColors.footerBorder,
    borderTopWidth: pdfBorder.hairlineWidth,
    color: '#777777',
    fontSize: 8,
    marginTop: 16,
    paddingTop: 8,
  },
});

export function QuoteDocumentPdf({ document }: QuoteDocumentPdfProps) {
  return (
    <Document
      author="Jedidiah Equipment"
      creator="Jedidiah Platform"
      language="en"
      producer="Jedidiah Platform"
      subject={`Quote ${document.quoteCode}`}
      title={document.quoteCode}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.sheet}>
          <QuoteDocumentHeader document={document} />
          <QuoteDocumentInfoPanels document={document} />
          <QuoteDocumentLineItemsTable document={document} />
          <QuoteDocumentBottomBlock document={document} />

          <Text style={styles.footerNote}>
            Please confirm customer details before order processing. This quotation remains subject to final written
            acceptance.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
