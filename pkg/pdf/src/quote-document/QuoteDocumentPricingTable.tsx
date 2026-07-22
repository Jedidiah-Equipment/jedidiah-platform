import { createStableRowKeys, formatCurrency } from '@pkg/domain';
import type { QuoteDocumentModel, QuoteDocumentPricingRow, QuoteDocumentWorkItem } from '@pkg/schema';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { pdfStyles } from './pdf-styles.js';
import { pdfBorder, pdfColors, pdfSpacing } from './pdf-theme.js';

type QuoteDocumentPricingTableProps = {
  document: QuoteDocumentModel;
};

const getPricingRowKey = createStableRowKeys<QuoteDocumentPricingRow>('quote-document-pricing-row');
const getWorkItemKey = createStableRowKeys<QuoteDocumentWorkItem>('quote-document-work-item');

const layout = {
  priceColumnWidth: 96,
  quantityColumnWidth: 42,
  subtotalColumnWidth: 106,
} as const;

const styles = StyleSheet.create({
  table: {
    borderColor: pdfColors.border,
    borderWidth: pdfBorder.defaultWidth,
    marginTop: pdfSpacing.section,
  },
  tableHeaderCell: {
    borderRightColor: pdfColors.darkDivider,
    borderRightWidth: pdfBorder.defaultWidth,
    paddingHorizontal: pdfSpacing.tableCellX,
    paddingVertical: pdfSpacing.tableCellY,
  },
  tableCell: {
    borderBottomColor: pdfColors.greyBorder,
    borderBottomWidth: pdfBorder.hairlineWidth,
    borderRightColor: pdfColors.greyBorder,
    borderRightWidth: pdfBorder.hairlineWidth,
    paddingHorizontal: pdfSpacing.tableCellX,
    paddingVertical: pdfSpacing.tableCellY,
  },
  qtyCell: {
    textAlign: 'center',
  },
  qtyCol: {
    width: layout.quantityColumnWidth,
  },
  priceCol: {
    width: layout.priceColumnWidth,
  },
  subtotalCol: {
    width: layout.subtotalColumnWidth,
  },
  noRightBorder: {
    borderRightWidth: 0,
  },
  sectionCell: {
    paddingHorizontal: pdfSpacing.tableCellX,
    paddingVertical: pdfSpacing.tableCellY,
  },
  noticeRow: {
    backgroundColor: pdfColors.staleNoticeBackground,
    color: pdfColors.staleNoticeText,
    padding: pdfSpacing.tableCellX,
  },
});

export function QuoteDocumentPricingTable({ document }: QuoteDocumentPricingTableProps) {
  const baseRow = document.pricingRows.find((row) => row.kind === 'base');
  const optionalRows = document.pricingRows.filter((row) => row.kind === 'optional');
  const workItems = quoteDocumentWorkItemRows(document);
  const adjustmentRows = document.pricingRows.filter((row) => row.kind === 'charge' || row.kind === 'discount');

  return (
    <View style={styles.table}>
      <TableHeader />
      {baseRow ? <PricingRow row={baseRow} product /> : null}
      {optionalRows.length > 0 ? (
        <>
          <SectionRow label="Optional Extras" />
          {optionalRows.map((row) => (
            <PricingRow key={getPricingRowKey(row)} row={row} />
          ))}
        </>
      ) : null}
      {workItems.length > 0 ? (
        <>
          <SectionRow label="Work Items" />
          {workItems.map((row) => (
            <WorkItemRow key={getWorkItemKey(row.workItem)} row={row} />
          ))}
        </>
      ) : null}
      {adjustmentRows.map((row) => (
        <PricingRow key={getPricingRowKey(row)} row={row} />
      ))}
      {document.staleSelectionNotes.length > 0 ? (
        <View style={styles.noticeRow}>
          {document.staleSelectionNotes.map((note) => (
            <Text key={note}>{note}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function quoteDocumentWorkItemRows({
  currencyCode,
  workItems,
}: Pick<QuoteDocumentModel, 'currencyCode' | 'workItems'>): {
  amount: string;
  name: string;
  workItem: QuoteDocumentWorkItem;
}[] {
  return workItems.map((workItem) => ({
    amount: formatCurrency(workItem.amount, currencyCode),
    name: workItem.name,
    workItem,
  }));
}

function TableHeader() {
  return (
    <View style={pdfStyles.flexRow}>
      <Text
        style={[
          pdfStyles.bgBlack,
          pdfStyles.colorWhite,
          pdfStyles.fontBold,
          pdfStyles.textBodyXs,
          pdfStyles.uppercase,
          styles.tableHeaderCell,
          styles.qtyCell,
          styles.qtyCol,
        ]}
      >
        Qty
      </Text>
      <Text
        style={[
          pdfStyles.bgBlack,
          pdfStyles.colorWhite,
          pdfStyles.fontBold,
          pdfStyles.textBodyXs,
          pdfStyles.uppercase,
          styles.tableHeaderCell,
          pdfStyles.flex1,
        ]}
      >
        Description
      </Text>
      <Text
        style={[
          pdfStyles.bgBlack,
          pdfStyles.colorWhite,
          pdfStyles.fontBold,
          pdfStyles.textBodyXs,
          pdfStyles.textRight,
          pdfStyles.uppercase,
          styles.tableHeaderCell,
          styles.priceCol,
        ]}
      >
        Unit Price
      </Text>
      <Text
        style={[
          pdfStyles.bgBlack,
          pdfStyles.colorWhite,
          pdfStyles.fontBold,
          pdfStyles.textBodyXs,
          pdfStyles.textRight,
          pdfStyles.uppercase,
          styles.tableHeaderCell,
          styles.subtotalCol,
          styles.noRightBorder,
        ]}
      >
        Subtotal
      </Text>
    </View>
  );
}

function SectionRow({ label }: { label: string }) {
  return (
    <View style={pdfStyles.flexRow}>
      <Text style={[pdfStyles.bgPanel, styles.sectionCell, styles.qtyCol]} />
      <Text
        style={[
          pdfStyles.bgPanel,
          pdfStyles.colorMutedDark,
          pdfStyles.fontBold,
          pdfStyles.textBodyXs,
          pdfStyles.uppercase,
          styles.sectionCell,
          pdfStyles.flex1,
        ]}
      >
        {label}
      </Text>
      <Text style={[pdfStyles.bgPanel, styles.sectionCell, styles.priceCol]} />
      <Text style={[pdfStyles.bgPanel, styles.sectionCell, styles.subtotalCol, styles.noRightBorder]} />
    </View>
  );
}

function PricingRow({ row, product = false }: { product?: boolean; row: QuoteDocumentPricingRow }) {
  const unitPrice = formatCurrency(row.unitPrice);
  const subtotal = formatCurrency(row.amount);

  return (
    <View style={pdfStyles.flexRow}>
      <Text style={[pdfStyles.textBody, styles.tableCell, styles.qtyCell, styles.qtyCol]}>{row.quantity}</Text>
      <View style={[pdfStyles.flex1, pdfStyles.textBody, styles.tableCell]}>
        {row.descriptionLines.map((line) => (
          <Text key={line} style={product ? [pdfStyles.fontBold, pdfStyles.uppercase] : [pdfStyles.uppercase]}>
            {line}
          </Text>
        ))}
      </View>
      <Text
        style={[
          pdfStyles.bgPriceCell,
          pdfStyles.fontBold,
          pdfStyles.textBody,
          pdfStyles.textRight,
          styles.tableCell,
          styles.priceCol,
        ]}
      >
        {unitPrice}
      </Text>
      <Text
        style={[
          pdfStyles.bgPriceCell,
          pdfStyles.fontBold,
          pdfStyles.textBody,
          pdfStyles.textRight,
          styles.tableCell,
          styles.subtotalCol,
          styles.noRightBorder,
        ]}
      >
        {subtotal}
      </Text>
    </View>
  );
}

function WorkItemRow({ row }: { row: ReturnType<typeof quoteDocumentWorkItemRows>[number] }) {
  return (
    <View style={pdfStyles.flexRow}>
      <Text style={[styles.tableCell, styles.qtyCol]} />
      <Text style={[pdfStyles.flex1, pdfStyles.textBody, pdfStyles.uppercase, styles.tableCell]}>{row.name}</Text>
      <Text style={[styles.tableCell, styles.priceCol]} />
      <Text
        style={[
          pdfStyles.bgPriceCell,
          pdfStyles.fontBold,
          pdfStyles.textBody,
          pdfStyles.textRight,
          styles.tableCell,
          styles.subtotalCol,
          styles.noRightBorder,
        ]}
      >
        {row.amount}
      </Text>
    </View>
  );
}
