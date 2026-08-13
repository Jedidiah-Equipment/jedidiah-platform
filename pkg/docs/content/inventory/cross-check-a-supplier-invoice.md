# Cross-check a Supplier invoice

When the Supplier's bill arrives, file it against the Purchase Order. It is read by AI and compared
with the order's lines, and every difference becomes a **flag** for you to judge. Nothing on the
ledger changes until you say so.

## File the invoice

1. Open **Purchase Orders** and select the order the stock arrived on.
2. On the **Supplier invoices** card, click **File invoice**.
3. Choose the invoice **PDF**.
4. Click **File invoice** and wait. The AI reads the invoice during the upload, so this takes longer
   than filing an ordinary document — leave the dialog open until it finishes.

The invoice joins the **Documents** card alongside the order's PDF revisions, and its cross-check
appears on the **Supplier invoices** card.

## Judge the flags

Each line shows what the order agreed beside what the Supplier billed, and one of four flags:

- **Price differs** — the billed unit price is not the agreed one.
- **Quantity differs** — the billed quantity is not what the line ordered.
- **Not on this order** — the invoice billed something no line on the order matches.
- **Not on this invoice** — a line on the order this invoice did not bill.

For a **Price differs** flag you have two answers:

- **Apply** confirms the Supplier's price. It posts a Revaluation that moves the Part's moving
  average by the value the Receipts got wrong, spread over what is still on hand. The button shows
  the new average before you click it.
- **Dismiss** sets the flag aside for good. Use it when the order's price is the right one and the
  invoice is what needs correcting — then take it up with the Supplier.

Every other flag takes **Dismiss** alone. There is nothing to apply: what the order says is a matter
for an [amendment](./amend-a-sent-purchase-order.md), not for the invoice.

## What the AI does

Filing an invoice sends the PDF to our AI provider, which transcribes it once: the billed lines with
their descriptions, quantities, unit prices and line totals, the invoice number and date, and any
Part or Job codes the Supplier echoed back. That transcription is stored with the invoice and is the
only thing the AI produces.

It is deliberately kept to reading:

- **It never invents a number.** A figure the invoice does not print comes back empty rather than
  calculated, so a blank is a blank and a disagreement is a real one.
- **It does not match, flag, or price anything.** Lines are matched to the order, flags raised, and
  Revaluations posted by the app and by you — all of it outside the AI, from what the invoice printed.
- **It changes nothing on its own.** No order, no price, no ledger row moves because of a read.
- **It reads once.** The transcription is stored, so opening the order again does not re-read the PDF.

## Notes

- **The cross-check is advice, never a decision.** It never edits the order, never changes a price,
  and never writes to the ledger on its own. A flag says two documents disagree; which one is wrong
  is your call.
- **Flags are recomputed every time you open the order.** Amend a quantity to what the Supplier
  actually sent and its flag is simply gone next time — there is nothing to tick off.
- **Dismissals stick.** A flag you have judged stays judged, showing who dismissed it, so the panel
  is the same tomorrow as you left it today.
- **One flag, one answer.** A price you have applied cannot be applied again — the Receipts stay
  stamped at what they were stamped at, so a second correction would move the average twice for one
  mistake.
- **"Stock already consumed; note only"** means the delivery has been drawn and its Job costs are
  already stamped. There is nothing left on the shelf for the correction to attach to, so no
  Revaluation is offered.
- **"We couldn't read this invoice"** means exactly that. The document is filed and everything else
  on the order is unaffected; check the prices against the lines yourself.
- Every line billed at a price the order did not agree also appears on **PO vs invoiced**, plant-wide,
  showing what was done about it.
- The panel is prices from end to end, so it is visible only to someone who can read inventory costs.
