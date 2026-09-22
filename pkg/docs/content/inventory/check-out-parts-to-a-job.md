# Check out Parts

A Checkout draws a Part from stock to a Job, to a Parts Sale, or Without a Job to a named Recipient.
It is what you post when material leaves the rack for the floor, for a Customer who bought the parts,
or for a quick repair elsewhere in the factory.

## From the Job

Use this when you already have the Job open — it is the shorter path, because the Job is fixed for
you.

1. Open the Job and go to its **Stock** tab.
2. Click **Check out**.
3. Scan or search for a **Part**, confirm the **Quantity**, and for a linear Part confirm **Length
   (mm)**. The standard purchase length is filled in when the Part has one.
4. Click **Add**, then repeat for every Part leaving stores.
5. Review the lines. You can edit a Quantity or remove a line; scanning the same Part and length
   again adds its Quantity to the existing line.
6. Click **Check out N lines**.

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
4. Scan or search for a **Part**, confirm the **Quantity**, and set **Length (mm)** for a linear
   Part. Click **Add** and repeat for the other Parts leaving stores.
5. Review the lines, then click **Check out N lines**. You can edit a Quantity or remove a line;
   scanning the same Part and length again adds its Quantity to the existing line.

A success toast confirms how many Parts were checked out. Closing the window with unrecorded lines
asks before discarding them; reloading the page discards them.

## To a Parts Sale

Use this when the parts are leaving for a Customer on a Parts Sale. The Checkout names the Quote the
parts were sold on, and carries no CFO warning because a Parts Sale has no CFO.

1. On the web, open **Inventory** and click **Check out**, or open the Parts Sale's Quote and click
   **Check out** in its **Stock drawn** panel.
2. From **Inventory**, choose **To a Parts Sale**, then click **Select Parts Sale** and choose the
   Quote. Search by Quote code, Customer, or work title. Only draft, sent, and accepted Parts Sales
   are offered.
3. Scan or search for a **Part**, confirm the **Quantity**, and set **Length (mm)** for a linear
   Part. Click **Add** and repeat for every Part leaving stores.
4. Review the lines, then click **Check out N lines**.

On the stores tablet, scan the Part, tap **Check out**, choose **To a Parts Sale**, and pick the
Quote.

## Without a Job

Use this for a quick repair or factory work that has no Job. The Parts count as used when they leave
stores; this does not create a personal stock balance for the Recipient.

1. On the web, open **Inventory** and click **Check out**.
2. Choose **Without a Job**.
3. Choose **Received by**. It starts with the current Operator, but you can select any active
   Equipment user.
4. Enter a short **Purpose**, such as “Repair factory drill”.
5. Check the separately displayed **Operator**.
6. Scan or search for a **Part**, confirm the **Quantity**, and set **Length (mm)** for a linear
   Part. Click **Add** and repeat for every Part leaving stores.
7. Review the lines, then click **Check out N lines**.

On the stores tablet, scan the Part and tap **Check out**. The tablet continues to post one Part at
a time.

## If it warns you

Two warnings are common here, and the button becomes **Check out anyway**:

- *This draw exceeds the Job CFO.* — the Job is taking more than it specced. Usually right; the CFO
  was a plan. A Parts Sale never shows this one.
- *This draw will take stock on hand negative.* — the ledger thinks the rack is emptier than you are
  finding it. Post it; the negative is what makes the disagreement visible.

See [Warnings are judgments, not blocks](./warnings-are-judgments.md).

When several lines warn, one prompt names every flagged line before anything is recorded. Continuing
posts every line; cancelling posts none.

## Notes

- You can check out against Parts the Job's CFO never mentioned. Off-CFO draws are legitimate.
- Only a Parts Sale can be checked out to. A Product or Service Work Quote sources a Job, so its
  parts go to the Job. A rejected or cancelled Parts Sale can only take returns.
- Two kinds of Job are never offered for Checkout. A cancelled Job can only take returns, and a Job
  that has been closed out has ended its stock life. See [Close out a Job's stock](./close-out-a-job.md).
- Drawing does not add to what the Job is owed — it converts commitment into drawn stock. See
  [Stock on hand, Commitment, and Free Stock](./stock-on-hand-and-free-stock.md).
- Periodic Parts cannot be checked out at all; they do not appear in the Part list. See
  [Perpetual and periodic Parts](./perpetual-and-periodic-stock.md).
- Took too much? [Return Parts to Store](./return-to-store.md) rather than posting a negative
  Checkout.
