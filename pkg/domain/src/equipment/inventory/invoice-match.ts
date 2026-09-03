import type { InvoiceMatchFlag, InvoiceMatchMethod } from '@pkg/schema';
import { invoiceFlagKey } from '@pkg/schema';

/**
 * Ties what a Supplier billed to what the order agreed (spec §5).
 *
 * Pure, and deliberately evaluated fresh on every read rather than stored with the extraction: an
 * amendment changes the order's lines after the invoice was filed (#1055), and a match computed at
 * upload time would keep flagging a price somebody has since agreed. The order's own lines *are*
 * the index the invoice is read against — a code naming a Part nobody ordered is an unmatched
 * invoice line whether or not the catalog knows it, so a wider Part lookup would change no outcome.
 *
 * Nothing here decides anything: every disagreement is a flag for a human to judge, and the ledger
 * is only ever written by the click that follows.
 */

/** Prices are agreed to the cent and quantities to the thousandth; compare no finer than that. */
const PRICE_TOLERANCE = 0.005;
const QUANTITY_TOLERANCE = 0.0005;

/**
 * How much of a Part's name an invoice line has to echo before the two are called the same thing.
 * Set where a Supplier reordering and abbreviating the words still matches, and a delivery
 * surcharge or a second Part does not.
 */
const DESCRIPTION_MATCH_THRESHOLD = 0.5;

/** A number agreeing lends weight to a description that nearly matches; it can never carry one alone. */
const PROXIMITY_BONUS = 0.1;

/**
 * How many words the two descriptions have to share before repeating them counts as a match at all.
 *
 * Coverage alone has no floor on how much text there is: a two-word Part name — `Door Cylinder`,
 * `Junction Box`, `Rear Mudflap`, sixteen of them in the catalog — is half covered by one shared
 * word, which would let `Door hinge kit` claim `Door Cylinder` and offer to revalue it at a price
 * billed for something else. Two words is the floor; a genuinely short name still matches on the
 * character comparison below, which a single accidental word does not carry.
 */
const MIN_SHARED_TOKENS = 2;

export type InvoiceMatchOrderLine = {
  orderedQuantity: number;
  partCode: string;
  partId: string;
  partName: string;
  supplierCode: string | null;
  /** Null when the Part has no agreed price to disagree with, or the cost gate took it away. */
  unitPrice: number | null;
};

export type InvoiceMatchInvoiceLine = {
  description: string;
  partCode: string | null;
  quantity: number | null;
  unitPrice: number | null;
};

export type InvoiceMatchRow = {
  description: string;
  flags: InvoiceMatchFlag[];
  invoiceQuantity: number | null;
  invoiceUnitPrice: number | null;
  matchMethod: InvoiceMatchMethod;
  orderedQuantity: number | null;
  partCode: string | null;
  partId: string | null;
  partName: string | null;
  unitPrice: number | null;
};

type Pairing = { invoiceIndex: number; method: InvoiceMatchMethod };

/**
 * One row per order line in the order's own line order, then one per invoice line nothing claimed.
 * Reading top-down is reading the order, which is the way the panel is worked.
 */
export function matchInvoiceLines({
  invoiceLines,
  orderLines,
}: {
  invoiceLines: readonly InvoiceMatchInvoiceLine[];
  orderLines: readonly InvoiceMatchOrderLine[];
}): InvoiceMatchRow[] {
  const pairings = pairLines(invoiceLines, orderLines);
  const claimedInvoiceLines = new Set([...pairings.values()].map((pairing) => pairing.invoiceIndex));

  const matchedRows = orderLines.map((line, orderIndex): InvoiceMatchRow => {
    const pairing = pairings.get(orderIndex);
    const invoiceLine = pairing ? invoiceLines[pairing.invoiceIndex] : undefined;

    if (!pairing || !invoiceLine) {
      return {
        description: line.partName,
        flags: [flag('unmatched-po-line', line.partId)],
        invoiceQuantity: null,
        invoiceUnitPrice: null,
        matchMethod: 'none',
        orderedQuantity: line.orderedQuantity,
        partCode: line.partCode,
        partId: line.partId,
        partName: line.partName,
        unitPrice: line.unitPrice,
      };
    }

    const flags: InvoiceMatchFlag[] = [];
    if (differs(invoiceLine.unitPrice, line.unitPrice, PRICE_TOLERANCE)) {
      flags.push(flag('price-mismatch', line.partId));
    }
    if (differs(invoiceLine.quantity, line.orderedQuantity, QUANTITY_TOLERANCE)) {
      flags.push(flag('quantity-mismatch', line.partId));
    }

    return {
      description: invoiceLine.description.trim() || line.partName,
      flags,
      invoiceQuantity: invoiceLine.quantity,
      invoiceUnitPrice: invoiceLine.unitPrice,
      matchMethod: pairing.method,
      orderedQuantity: line.orderedQuantity,
      partCode: line.partCode,
      partId: line.partId,
      partName: line.partName,
      unitPrice: line.unitPrice,
    };
  });

  const unmatchedRows = invoiceLines.flatMap((invoiceLine, invoiceIndex): InvoiceMatchRow[] =>
    claimedInvoiceLines.has(invoiceIndex)
      ? []
      : [
          {
            description: invoiceLine.description.trim() || invoiceLine.partCode || 'Unnamed invoice line',
            // Keyed by position on the invoice, not by position in this list: the key has to survive
            // an order line being amended in beside it.
            flags: [flag('unmatched-invoice-line', String(invoiceIndex))],
            invoiceQuantity: invoiceLine.quantity,
            invoiceUnitPrice: invoiceLine.unitPrice,
            matchMethod: 'none',
            orderedQuantity: null,
            partCode: invoiceLine.partCode,
            partId: null,
            partName: null,
            unitPrice: null,
          },
        ],
  );

  return [...matchedRows, ...unmatchedRows];
}

/**
 * Order-line index → the invoice line that answers it. Three passes, narrowest evidence first: a
 * printed Part code beats the Supplier's own code, and both beat a description that merely reads
 * alike. Each side is claimed at most once, so a Supplier splitting one line across two billings
 * leaves the second visible as unmatched rather than silently overwriting the first.
 */
function pairLines(
  invoiceLines: readonly InvoiceMatchInvoiceLine[],
  orderLines: readonly InvoiceMatchOrderLine[],
): Map<number, Pairing> {
  const pairings = new Map<number, Pairing>();
  const claimedInvoiceLines = new Set<number>();

  const claim = (orderIndex: number, invoiceIndex: number, method: InvoiceMatchMethod): void => {
    pairings.set(orderIndex, { invoiceIndex, method });
    claimedInvoiceLines.add(invoiceIndex);
  };

  for (const method of ['part-code', 'supplier-code'] as const) {
    orderLines.forEach((line, orderIndex) => {
      if (pairings.has(orderIndex)) return;

      const code = normalizeCode(method === 'part-code' ? line.partCode : line.supplierCode);
      if (!code) return;

      const invoiceIndex = invoiceLines.findIndex(
        (invoiceLine, index) => !claimedInvoiceLines.has(index) && normalizeCode(invoiceLine.partCode) === code,
      );
      if (invoiceIndex !== -1) claim(orderIndex, invoiceIndex, method);
    });
  }

  // Best-scoring pair first across the whole remaining grid, so a description that fits two lines
  // goes to the one it fits better rather than to whichever was read first.
  const candidates = orderLines
    .flatMap((line, orderIndex) =>
      pairings.has(orderIndex)
        ? []
        : invoiceLines.map((invoiceLine, invoiceIndex) => ({
            invoiceIndex,
            orderIndex,
            score: claimedInvoiceLines.has(invoiceIndex) ? 0 : scoreDescription(invoiceLine, line),
          })),
    )
    .filter((candidate) => candidate.score >= DESCRIPTION_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.orderIndex - b.orderIndex || a.invoiceIndex - b.invoiceIndex);

  for (const candidate of candidates) {
    if (pairings.has(candidate.orderIndex) || claimedInvoiceLines.has(candidate.invoiceIndex)) continue;
    claim(candidate.orderIndex, candidate.invoiceIndex, 'description');
  }

  return pairings;
}

/**
 * How much one invoice line reads like one order line, from zero to one.
 *
 * The base is text: how much of the Part's own wording the invoice repeats, or how alike the two
 * strings are character by character — whichever is kinder, because Suppliers both abbreviate and
 * reorder. Agreeing numbers then nudge a near miss over the line; they never make a match on their
 * own, which is what stops a delivery surcharge priced by coincidence from claiming a Part.
 */
function scoreDescription(invoiceLine: InvoiceMatchInvoiceLine, orderLine: InvoiceMatchOrderLine): number {
  const description = normalizeText(invoiceLine.description);
  if (!description) return 0;

  const partText = normalizeText(`${orderLine.partCode} ${orderLine.partName}`);
  const similarity = Math.max(
    tokenCoverage(normalizeText(orderLine.partName), description),
    tokenCoverage(partText, description),
    bigramDice(partText, description),
  );
  if (similarity === 0) return 0;

  const quantityAgrees = !differs(invoiceLine.quantity, orderLine.orderedQuantity, QUANTITY_TOLERANCE);
  const priceAgrees = !differs(invoiceLine.unitPrice, orderLine.unitPrice, PRICE_TOLERANCE);

  return Math.min(1, similarity + (quantityAgrees ? PROXIMITY_BONUS : 0) + (priceAgrees ? PROXIMITY_BONUS : 0));
}

/** Nothing to disagree with is not a disagreement: an unprinted number is silence, not a mismatch. */
function differs(invoiced: number | null, agreed: number | null, tolerance: number): boolean {
  if (invoiced === null || agreed === null) return false;

  return Math.abs(invoiced - agreed) > tolerance;
}

function flag(kind: InvoiceMatchFlag['kind'], subject: string): InvoiceMatchFlag {
  return { key: invoiceFlagKey(kind, subject), kind };
}

/** Codes are compared on their characters alone: `BOLT M12/40` and `bolt-m12-40` are one code. */
function normalizeCode(code: string | null): string {
  return (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The share of the Part's own words the invoice line repeats, once enough of them are shared. */
function tokenCoverage(partText: string, invoiceText: string): number {
  const partTokens = new Set(partText.split(' ').filter(Boolean));
  if (partTokens.size === 0) return 0;

  const invoiceTokens = new Set(invoiceText.split(' ').filter(Boolean));
  const shared = [...partTokens].filter((token) => invoiceTokens.has(token)).length;
  if (shared < MIN_SHARED_TOKENS) return 0;

  return shared / partTokens.size;
}

/** Sørensen–Dice over character bigrams — the reordering-tolerant half of the comparison. */
function bigramDice(left: string, right: string): number {
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) return 0;

  const remaining = [...rightBigrams];
  let shared = 0;

  for (const bigram of leftBigrams) {
    const index = remaining.indexOf(bigram);
    if (index !== -1) {
      remaining.splice(index, 1);
      shared += 1;
    }
  }

  return (2 * shared) / (leftBigrams.length + rightBigrams.length);
}

function bigrams(text: string): string[] {
  const compact = text.replace(/ /g, '');

  return Array.from({ length: Math.max(0, compact.length - 1) }, (_, index) => compact.slice(index, index + 2));
}
