# Export Unit stock

The Units list exports every On Hand Product Unit as a CSV: what each machine cost in material, what
its Product lists for, and the Job, Quote, and Invoice Numbers to reconcile it against. It opens in
Excel or Sheets.

## Steps

1. Open **Units**.
2. Filter to what you want. Set **Build** to **On Hand** for the machines we still hold, or
   **Complete** for the ones already sold. A **Product** or an **Owner** narrows it further, and
   search by serial, VIN, Owner, or Product narrows it the same way.
3. Click **Export Units**. The file downloads as `unit-stock-<date>.csv`.

## Notes

- The export is always On Hand Units, whatever the **Build** filter is showing. A Unit still **In
  Build** never appears — it has no completion date, and what it has drawn so far is work in
  progress rather than what a machine cost.
- **date_completed** is the Job Completion of the Unit's Build Job, which is what makes it On Hand.
- Cost is material only, summed across every live Job the machine has been through and priced at what
  each Checkout was stamped with — see
  [How stock costs work](../inventory/how-stock-costs-work.md). It carries no labour, so the CSV puts
  it beside the retail figures rather than working out a margin.
- A cost cell is **blank**, not zero, when one of those Jobs still holds material nobody has priced
  yet. A machine whose Jobs drew nothing at all costs zero.
- **cost_inc_vat** is the ex-VAT figure at the standard rate, not the VAT any Supplier actually
  billed. Reconcile against a Supplier invoice on the ex-VAT column.
- **product_retail_ex_vat** is the Product's base price as the catalog holds it **today** — the list
  price of the model, not what this machine sold for. The Quote and Invoice Numbers are how you find
  what it actually went for.
- The Customer, Quote Number, and Invoice Number come from the sale that placed the machine where it
  is. They are blank on a machine we still hold, and on one that changed hands in an Ownership
  Transfer recorded by hand, which carries no Quote of ours.
- **Export Units** appears only if you can read inventory costs, Units, Products, and Quotes.
