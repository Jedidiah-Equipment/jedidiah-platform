# Export completed Jobs

The Job List exports every completed Job as a CSV: what each one cost in material, what its Quote
sold for, and the Job, Quote, and invoice numbers to reconcile it against. It opens in Excel or
Sheets.

## Steps

1. Open the **Job List**.
2. Turn on **Include Completed** to see the finished work you are about to export.
3. Filter to what you want: a **Complete** date range, a **Customer**, a Job code, or a serial
   number. Search narrows the export the same way.
4. Click **Export Completed**. The file downloads as `completed-jobs-<date>.csv`.

## Notes

- The export is always completed Jobs, whatever the **Include Completed** switch is showing. A
  Cancelled Job never appears — it was abandoned, not completed.
- Cost is material only, priced at what each Checkout was stamped with — see
  [How stock costs work](../inventory/how-stock-costs-work.md). It carries no labour, so it is not a
  full cost of sale, and the CSV puts it beside the retail figures rather than working out a margin.
- **cost_inc_vat** is the ex-VAT figure at the standard rate, not the VAT any Supplier actually
  billed. Reconcile against a Supplier invoice on the ex-VAT column.
- A cost cell is **blank**, not zero, when the Job still holds material nobody has priced yet. A Job
  that drew nothing at all costs zero.
- Retail comes from the Job's Quote and is the whole sale, delivery and Service Work included.
- A Stock Build has no Quote, so its retail cells are blank while its cost still reports — a total
  of the cost column therefore includes machines nobody has bought yet.
- **Export Completed** appears only if you can read inventory costs, Jobs, and Quotes.
