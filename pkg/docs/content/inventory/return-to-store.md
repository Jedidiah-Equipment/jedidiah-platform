# Return to Store

A Return to Store puts a Part back on the rack against the Job or Checkout Without a Job that drew
it. It comes back at the cost its exact source is still carrying, rather than at whatever the
average has drifted to since.

## From the Job

1. Open the Job and go to its **Stock** tab.
2. Click **Return to store**.
3. Choose the **Part**, enter the **Quantity**, and set **Length (mm)** for a linear Part.
4. Click **Return stock**.

## From Stock on hand

1. Open **Inventory**.
2. Click **Return to store**.
3. Keep **To a Job**, then click **Select Job** and choose the Job.
   The picker opens on **Last updated**; **Last created** and **Not complete** are the other two
   lists. Search narrows the list you are on, by Job code, Product, work title, or Customer. Returns
   are never refused for lifecycle state, so **Last updated** reaches every Job. The footer says how
   many of the matching Jobs it has loaded; use **Load more** to reach the rest.
4. Choose the **Part**, enter the **Quantity**, and set **Length (mm)** for a linear Part.
5. Click **Return stock**.

A **Stock returned to store** toast confirms it.

## From a Checkout Without a Job

1. Open **Inventory** and click **Return to store**, or scan the Part on the stores tablet and tap
   **Return to store**. You can also click **Return to Store** beside the original Checkout in a
   Part's history.
2. Choose **Without a Job**.
3. Find the **Original Checkout** by Part, Recipient, or Purpose. Newest Checkouts appear first and
   show the date, quantity taken, and quantity already returned. Fully returned Checkouts remain
   available when the physical quantity disagrees with the ledger.
4. Enter the **Quantity** coming back. The original Checkout fixes the Part, length, and Recipient.
5. Check the separately displayed **Operator**, then click or tap **Return stock**.

## If it warns you

*This return exceeds the quantity currently drawn.* means you are returning more than the selected
Job or Checkout still has outstanding. Worth a second look — it usually means the wrong source was
selected or an earlier Checkout was recorded incorrectly. See
[Warnings are judgments, not blocks](./warnings-are-judgments.md).

## Notes

- Returning is always better than posting a negative Checkout. It is the movement built for this,
  and it reverses at the right cost.
- A cancelled Job can still take returns. That is deliberate — material recovered from work that
  never finished would otherwise be stranded off the ledger.
- Returning what is left over is the normal last step before closing a Job out. See
  [Close out a Job's stock](./close-out-a-job.md).
- A disabled historic Recipient does not prevent a valid Operator from returning unused Parts.
