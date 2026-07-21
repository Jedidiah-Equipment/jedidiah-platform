import { formatCurrency } from '@pkg/domain';
import type { QuoteDocumentLineItem, QuoteDocumentModel, QuoteDocumentWorkItem } from '@pkg/schema';
import { StyleSheet, Text, View } from '@react-pdf/renderer';
import { pdfStyles } from './pdf-styles.js';
import { pdfBorder, pdfColors, pdfSpacing } from './pdf-theme.js';

type QuoteDocumentLineItemsTableProps = {
  document: QuoteDocumentModel;
};

const getLineItemKey = (() => {
  const keys = new WeakMap<QuoteDocumentLineItem, string>();
  let nextKey = 0;

  return (item: QuoteDocumentLineItem) => {
    let key = keys.get(item);
    if (key === undefined) {
      key = `quote-document-line-item-${nextKey}`;
      nextKey += 1;
      keys.set(item, key);
    }
    return key;
  };
})();

const getWorkItemKey = (() => {
  const keys = new WeakMap<QuoteDocumentWorkItem, string>();
  let nextKey = 0;

  return (item: QuoteDocumentWorkItem) => {
    let key = keys.get(item);
    if (key === undefined) {
      key = `quote-document-work-item-${nextKey}`;
      nextKey += 1;
      keys.set(item, key);
    }
    return key;
  };
})();

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

export function QuoteDocumentLineItemsTable({ document }: QuoteDocumentLineItemsTableProps) {
  const baseItem = document.lineItems.find((item) => item.kind === 'base');
  const optionalItems = document.lineItems.filter((item) => item.kind === 'optional');
  const lineItems = document.lineItems.filter((item) => item.kind === 'lineItem');
  const workItems = quoteDocumentWorkItemRows(document);
  const adjustmentItems = document.lineItems.filter((item) => item.kind === 'charge' || item.kind === 'discount');

  return (
    <View style={styles.table}>
      <TableHeader />
      {baseItem ? <LineItemRow item={baseItem} product /> : null}
      {optionalItems.length > 0 ? (
        <>
          <SectionRow label="Optional Extras" />
          {optionalItems.map((item) => (
            <LineItemRow item={item} key={getLineItemKey(item)} />
          ))}
        </>
      ) : null}
      {lineItems.length > 0 ? (
        <>
          <SectionRow label="Line Items" />
          {lineItems.map((item) => (
            <LineItemRow item={item} key={getLineItemKey(item)} />
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
      {adjustmentItems.map((item) => (
        <LineItemRow item={item} key={getLineItemKey(item)} />
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

export function quoteDocumentWorkItemRows({
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

function LineItemRow({ item, product = false }: { item: QuoteDocumentLineItem; product?: boolean }) {
  const unitPrice = formatCurrency(item.unitPrice);
  const subtotal = formatCurrency(item.amount);

  return (
    <View style={pdfStyles.flexRow}>
      <Text style={[pdfStyles.textBody, styles.tableCell, styles.qtyCell, styles.qtyCol]}>{item.quantity}</Text>
      <View style={[pdfStyles.flex1, pdfStyles.textBody, styles.tableCell]}>
        {item.descriptionLines.map((line) => (
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
