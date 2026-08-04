# Check out Parts to a Job

A Checkout draws a Part from stock against a Job. It is what you post when material leaves the rack
for the floor.

## From the Job

Use this when you already have the Job open — it is the shorter path, because the Job is fixed for
you.

1. Open the Job and go to its **Stock** tab.
2. Click **Check out**.
3. Choose the **Part**.
4. Enter the **Quantity**.
5. For a linear Part, enter **Length (mm)**. The field shows the standard purchase length if the
   Part has one.
6. Click **Check out stock**.

## From Stock on hand

Use this when you are working from the rack rather than from a Job.

1. Open **Inventory**.
2. Click **Check out**.
3. Search **Job** by code or name and select it.
4. Choose the **Part**, enter the **Quantity**, and set **Length (mm)** for a linear Part.
5. Click **Check out stock**.

A **Stock checked out** toast confirms it.

## If it warns you

Two warnings are common here, and the button becomes **Check out anyway**:

- *This draw exceeds the Job CFO.* — the Job is taking more than it specced. Usually right; the CFO
  was a plan.
- *This draw will take stock on hand negative.* — the ledger thinks the rack is emptier than you are
  finding it. Post it; the negative is what makes the disagreement visible.

See [Warnings are judgments, not blocks](./warnings-are-judgments.md).

## Notes

- You can check out against any Job, and against Parts the Job's CFO never mentioned. Off-CFO draws
  are legitimate.
- Drawing does not add to what the Job is owed — it converts commitment into drawn stock. See
  [Stock on hand, Commitment, and Free Stock](./stock-on-hand-and-free-stock.md).
- Periodic Parts cannot be checked out at all; they do not appear in the Part list. See
  [Perpetual and periodic Parts](./perpetual-and-periodic-stock.md).
- Took too much? [Return Parts to Store](./return-to-store.md) rather than posting a negative
  Checkout.
