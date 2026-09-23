import { formatCurrency, formatDate, formatHours, formatNumber } from '@pkg/domain';
import { JEDIDIAH_CONTRACTING_BUSINESS_DETAILS } from '@pkg/domain/contracting';
import type {
  JobCardModel,
  JobCardReading,
  JobCardReadingMarker,
  JobCardStintLine,
  JobCardSubtotal,
} from '@pkg/schema/contracting';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import { pdfFontFamily, pdfTitleFontFamily } from '../../pdf-fonts.js';
import { jedidiahMarkWhiteSrc } from '../../pdf-logo.js';
import { pdfColors } from '../../pdf-theme.js';

const layout = { pagePadding: 24, footerSpace: 56, sectionGap: 8 } as const;
const column = { machine: 96, reading: 70, hours: 90, amount: 64 } as const;

const styles = StyleSheet.create({
  page: {
    color: pdfColors.black,
    fontFamily: pdfFontFamily,
    fontSize: 8,
    padding: layout.pagePadding,
    paddingBottom: layout.footerSpace,
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
  brand: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 10 },
  mark: { height: 30, objectFit: 'contain', width: 23 },
  wordmark: { color: pdfColors.yellow, fontFamily: pdfTitleFontFamily, fontSize: 16, fontWeight: 700 },
  title: { fontFamily: pdfTitleFontFamily, fontSize: 24, fontWeight: 700 },
  subtitle: { color: pdfColors.mutedOnDark, fontSize: 8, marginTop: 2 },
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
  panel: { backgroundColor: pdfColors.panel, flex: 1, padding: 12 },
  label: { color: pdfColors.muted, fontSize: 7, marginBottom: 4, textTransform: 'uppercase' },
  strong: { fontWeight: 700, marginBottom: 2 },
  line: { marginBottom: 2 },
  muted: { color: pdfColors.muted, fontSize: 7, marginTop: 1 },
  tableHeader: {
    backgroundColor: pdfColors.black,
    color: pdfColors.white,
    flexDirection: 'row',
    fontWeight: 700,
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  row: {
    borderBottomColor: pdfColors.greyBorder,
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  cells: { flexDirection: 'row', gap: 6 },
  subtotalRow: { backgroundColor: pdfColors.panel, fontWeight: 700 },
  machine: { width: column.machine },
  reading: { width: column.reading },
  hours: { width: column.hours },
  rate: { flex: 1 },
  amount: { textAlign: 'right', width: column.amount },
  wide: { flex: 1 },
  legend: { color: pdfColors.muted, fontSize: 7, marginTop: 4 },
  totals: { alignSelf: 'flex-end', marginTop: layout.sectionGap, width: 260 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 3 },
  grandTotal: {
    backgroundColor: pdfColors.black,
    color: pdfColors.white,
    fontSize: 10,
    fontWeight: 700,
    marginTop: 2,
    paddingVertical: 6,
  },
  unpriced: { color: pdfColors.muted, marginTop: layout.sectionGap },
  notes: { backgroundColor: pdfColors.panel, marginTop: layout.sectionGap, padding: 12 },
  footer: {
    bottom: 20,
    color: pdfColors.muted,
    fontSize: 7,
    gap: 2,
    left: layout.pagePadding,
    position: 'absolute',
    right: layout.pagePadding,
  },
});

const markerGlyph: Record<JobCardReadingMarker, string> = {
  verified: '●',
  photo: '○',
  'no-photo': '▲',
  disputed: '!',
  amended: '~',
};

const formatAmount = (amount: number | null) => (amount === null ? '—' : formatCurrency(amount));
const formatQuantity = (quantity: number) => formatNumber(quantity, { decimals: Number.isInteger(quantity) ? 0 : 2 });

export function JobCardPdf({ document }: { document: JobCardModel }) {
  const internal = document.variant === 'internal';
  const details = JEDIDIAH_CONTRACTING_BUSINESS_DETAILS;
  return (
    <Document title={`${document.jobNumber} Job Card`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <View style={styles.brand}>
              <Image src={jedidiahMarkWhiteSrc} style={styles.mark} />
              <Text style={styles.wordmark}>JEDIDIAH CONTRACTING</Text>
            </View>
            <Text style={styles.title}>JOB CARD</Text>
            <Text style={styles.subtitle}>
              {`${internal ? 'Internal copy' : 'Customer copy'} · Works summary — not an invoice`}
            </Text>
          </View>
          <View style={styles.businessDetails}>
            <Text style={styles.code}>{document.jobNumber}</Text>
            <Text style={styles.businessName}>{details.tradingName}</Text>
            {details.registeredName ? <Text>{details.registeredName}</Text> : null}
            {details.vatRegistrationNumber ? <Text>{`VAT registration: ${details.vatRegistrationNumber}`}</Text> : null}
            {details.companyRegistrationNumber ? (
              <Text>{`Company registration: ${details.companyRegistrationNumber}`}</Text>
            ) : null}
            <Text>{`Address: ${details.address}`}</Text>
            {details.email ? <Text>{`Email: ${details.email}`}</Text> : null}
            {details.cellphone ? <Text>{`Cell: ${details.cellphone}`}</Text> : null}
          </View>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.panel}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.strong}>{document.customerName}</Text>
            <Text style={styles.line}>{document.farmName}</Text>
          </View>
          <View style={styles.panel}>
            <Text style={styles.label}>Job</Text>
            <Text style={styles.strong}>{document.workTypeName}</Text>
            {document.description ? <Text style={styles.line}>{document.description}</Text> : null}
            <Text style={styles.line}>
              {`${formatDate(document.startDate, 'short', '—')} – ${formatDate(document.endDate, 'short', '—')}`}
            </Text>
            {document.foremanName ? <Text style={styles.line}>{`Foreman: ${document.foremanName}`}</Text> : null}
            {document.invoiceNumber ? (
              <Text style={styles.line}>
                {`Invoice: ${document.invoiceNumber} · ${formatDate(document.invoicedAt, 'short')}`}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={styles.machine}>Machine</Text>
          <Text style={styles.reading}>Arrival</Text>
          <Text style={styles.reading}>Departure</Text>
          <Text style={styles.hours}>{internal ? 'Work · travel' : 'Hours'}</Text>
          <Text style={styles.rate}>Rate</Text>
          <Text style={styles.amount}>Amount</Text>
        </View>
        {document.lines.map((line) =>
          line.kind === 'subtotal' ? (
            <SubtotalRow key={`subtotal-${line.machineCode}`} line={line} />
          ) : (
            <StintRow key={`${line.machineCode}-${line.arrival?.capturedAt}`} line={line} />
          ),
        )}
        {document.chargeLines.map((line) => (
          <ChargeRow key={`${line.description}-${line.amount}`} label={line.description} amount={line.amount} />
        ))}
        <ChargeRow label={dieselLabel(document.diesel)} amount={document.diesel.amount} />
        {internal ? (
          <Text style={styles.legend}>
            Readings: ● photo, AI-verified · ○ photo · ▲ no photo · ! disputed · ~ amended
          </Text>
        ) : null}

        {document.totals ? (
          <Totals totals={document.totals} discount={document.discount} />
        ) : (
          <Text style={styles.unpriced}>Not yet priced — hours only.</Text>
        )}

        {internal && document.repricingNote ? (
          <View style={styles.notes} wrap={false}>
            <Text style={styles.label}>Re-pricing note</Text>
            <Text>{document.repricingNote}</Text>
          </View>
        ) : null}
        {internal && document.notes ? (
          <View style={styles.notes} wrap={false}>
            <Text style={styles.label}>Site notes</Text>
            <Text>{document.notes}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>
            {`Generated ${formatDate(document.generatedAt, 'medium')} · Readings are hour-meter values; meter photos are kept in the app.`}
          </Text>
          <Text>This is a works summary, not an invoice. Amounts exclude VAT; diesel is VAT-exempt.</Text>
        </View>
      </Page>
    </Document>
  );
}

function ReadingCell({ reading }: { reading: JobCardReading | null }) {
  if (!reading) return <Text style={styles.reading}>—</Text>;
  const marker = reading.marker ? ` ${markerGlyph[reading.marker]}` : '';
  return (
    <View style={styles.reading}>
      <Text>{`${formatHours(reading.value)}${marker}`}</Text>
      <Text style={styles.muted}>{formatDate(reading.capturedAt, 'medium')}</Text>
    </View>
  );
}

function HoursCell({ line }: { line: JobCardStintLine }) {
  const { hours } = line;
  return (
    <View style={styles.hours}>
      {hours.variant === 'customer' ? (
        <Text>{hours.total === null ? '—' : formatHours(hours.total)}</Text>
      ) : (
        <>
          <Text>
            {`${hours.work === null ? '—' : formatHours(hours.work)}${
              hours.travel > 0 ? ` + ${formatHours(hours.travel)} travel` : ''
            }`}
          </Text>
          {hours.unaccounted > 0 ? (
            <Text style={styles.muted}>
              {`+ ${formatHours(hours.unaccounted)} unaccounted${hours.gapReason ? ` — ${hours.gapReason}` : ''}`}
            </Text>
          ) : null}
        </>
      )}
      {line.measures.map((measure) => (
        <Text key={measure.name} style={styles.muted}>{`${formatQuantity(measure.quantity)} ${measure.name}`}</Text>
      ))}
    </View>
  );
}

function RateCell({ line }: { line: JobCardStintLine }) {
  if (line.noCharge) return <Text style={styles.rate}>No charge</Text>;
  if (!line.rate) return <Text style={styles.rate}>—</Text>;
  return (
    <View style={styles.rate}>
      <Text>{line.rate.name}</Text>
      <Text style={styles.muted}>{`${formatCurrency(line.rate.unitAmount)} / ${line.rate.per}`}</Text>
    </View>
  );
}

function StintRow({ line }: { line: JobCardStintLine }) {
  const comments = [
    line.arrival?.comment ? `Arrival: ${line.arrival.comment}` : null,
    line.departure?.comment ? `Departure: ${line.departure.comment}` : null,
  ].filter((comment) => comment !== null);
  return (
    <View style={styles.row} wrap={false}>
      <View style={styles.cells}>
        <View style={styles.machine}>
          <Text style={styles.strong}>{line.machineCode}</Text>
          {line.implementCode ? <Text>{`+ ${line.implementCode}`}</Text> : null}
          <Text style={styles.muted}>{line.categoryName}</Text>
          {line.driverName ? <Text style={styles.muted}>{`Driver: ${line.driverName}`}</Text> : null}
        </View>
        <ReadingCell reading={line.arrival} />
        <ReadingCell reading={line.departure} />
        <HoursCell line={line} />
        <RateCell line={line} />
        <Text style={styles.amount}>{formatAmount(line.amount)}</Text>
      </View>
      {comments.map((comment) => (
        <Text key={comment} style={styles.muted}>
          {comment}
        </Text>
      ))}
    </View>
  );
}

function SubtotalRow({ line }: { line: JobCardSubtotal }) {
  return (
    <View style={[styles.row, styles.subtotalRow]} wrap={false}>
      <View style={styles.cells}>
        <Text style={styles.machine}>{`${line.machineCode} subtotal`}</Text>
        <Text style={styles.reading} />
        <Text style={styles.reading} />
        <Text style={styles.hours}>{formatHours(line.hours)}</Text>
        <Text style={styles.rate} />
        <Text style={styles.amount}>{formatAmount(line.amount)}</Text>
      </View>
    </View>
  );
}

function ChargeRow({ label, amount }: { label: string; amount: number | null }) {
  return (
    <View style={styles.row} wrap={false}>
      <View style={styles.cells}>
        <Text style={styles.wide}>{label}</Text>
        <Text style={styles.amount}>{formatAmount(amount)}</Text>
      </View>
    </View>
  );
}

function dieselLabel(diesel: JobCardModel['diesel']) {
  const litres = `${formatQuantity(diesel.litres)} L`;
  return diesel.unitPrice === null
    ? `Diesel (VAT-exempt) · ${litres}`
    : `Diesel (VAT-exempt) · ${litres} × ${formatCurrency(diesel.unitPrice)}`;
}

function Totals({
  totals,
  discount,
}: {
  totals: NonNullable<JobCardModel['totals']>;
  discount: JobCardModel['discount'];
}) {
  return (
    <View style={styles.totals} wrap={false}>
      <View style={styles.totalRow}>
        <Text>Subtotal</Text>
        <Text>{formatCurrency(totals.subtotal)}</Text>
      </View>
      {discount ? (
        <View style={styles.totalRow}>
          <Text>{discount.label}</Text>
          <Text>{`− ${formatCurrency(discount.amount)}`}</Text>
        </View>
      ) : null}
      <View style={styles.totalRow}>
        <Text>Diesel (VAT-exempt)</Text>
        <Text>{formatCurrency(totals.diesel)}</Text>
      </View>
      <View style={[styles.totalRow, styles.grandTotal]}>
        <Text>Total ex VAT</Text>
        <Text>{formatCurrency(totals.total)}</Text>
      </View>
    </View>
  );
}
