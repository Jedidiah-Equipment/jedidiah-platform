# Read a Job's material variance

Job Material Variance is what a Job planned in material against what it actually took, and what
those draws cost. It reads the same whether the Job is still running, completed, or closed out.

## Steps

1. Open **Close-out**, click the Job's row, and click **Material variance**. From the Job List, open
   the Job and its **Variance** tab instead — the same report either way.
2. Read the line under the title. It says where the Job's stock life stands.
3. Read **Planned** against **Drawn** per Part. **Variance** is the difference: a plus is material
   the Job took beyond its plan, a minus is planned material it never drew.
4. Read **Over plan** and **Off CFO** above the table. **Off CFO** counts the Parts drawn against the
   Job with nothing in its plan asking for them — on a Custom Job that is every Part, and it is the
   unplanned material the report exists to surface.
5. If you may read costs, read **Actual cost** per Part, plus **Drawn cost** and **Off-CFO cost**
   above the table.

## Notes

- Every figure is priced at what each Checkout was stamped with at the time — see
  [How stock costs work](./how-stock-costs-work.md). A Receipt landing later at a different price
  never moves a number here.
- There is no planned cost, only actual: the CFO fixes quantities, not money.
- A Part drawn in two lengths reports as one row. The variance is on the Part, not on a length.
- A total reads **not priced** as soon as one drawn Part has no cost yet, rather than quietly
  reporting a smaller number.
