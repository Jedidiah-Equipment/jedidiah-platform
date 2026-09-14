# Check out Parts

A Checkout draws a Part from stock either to a Job or Without a Job to a named Recipient. It is what
you post when material leaves the rack for the floor or a quick repair elsewhere in the factory.

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
3. Keep **To a Job**, then click **Select Job** and choose the Job.
   The picker opens on **Not complete**, the open work stock is normally drawn for. Search narrows
   the list you are on — by Job code, Product, work title, or Customer — so a completed Job is found
   from **Last updated** or **Last created**, not from **Not complete**. A completed Job stays
   pickable there until its stock has been closed out. The footer says how many of the matching Jobs
   it has loaded; use **Load more** to reach the rest.
4. Choose the **Part**, enter the **Quantity**, and set **Length (mm)** for a linear Part.
5. Click **Check out stock**.

A **Stock checked out** toast confirms it.

## Without a Job

Use this for a quick repair or factory work that has no Job. The Parts count as used when they leave
stores; this does not create a personal stock balance for the Recipient.

1. Open **Inventory** and click **Check out**, or scan the Part on the stores tablet and tap
   **Check out**.
2. Choose **Without a Job**.
3. Choose **Received by**. It starts with the current Operator, but you can select any active
   Equipment user.
4. Enter a short **Purpose**, such as “Repair factory drill”.
5. Choose the **Part** if it is not already fixed, enter the **Quantity**, and set **Length (mm)**
   for a linear Part.
6. Check the separately displayed **Operator**, then click or tap **Check out stock**.

## If it warns you

Two warnings are common here, and the button becomes **Check out anyway**:

- *This draw exceeds the Job CFO.* — the Job is taking more than it specced. Usually right; the CFO
  was a plan.
- *This draw will take stock on hand negative.* — the ledger thinks the rack is emptier than you are
  finding it. Post it; the negative is what makes the disagreement visible.

See [Warnings are judgments, not blocks](./warnings-are-judgments.md).

## Notes

- You can check out against Parts the Job's CFO never mentioned. Off-CFO draws are legitimate.
- Two kinds of Job are never offered for Checkout. A cancelled Job can only take returns, and a Job
  that has been closed out has ended its stock life. See [Close out a Job's stock](./close-out-a-job.md).
- Drawing does not add to what the Job is owed — it converts commitment into drawn stock. See
  [Stock on hand, Commitment, and Free Stock](./stock-on-hand-and-free-stock.md).
- Periodic Parts cannot be checked out at all; they do not appear in the Part list. See
  [Perpetual and periodic Parts](./perpetual-and-periodic-stock.md).
- Took too much? [Return Parts to Store](./return-to-store.md) rather than posting a negative
  Checkout.
