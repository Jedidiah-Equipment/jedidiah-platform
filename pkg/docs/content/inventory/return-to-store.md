# Return to Store

A Return to Store puts a Part back on the rack against the Job that drew it. It comes back at the
cost that Job is still carrying, rather than at whatever the average has drifted to since.

## From the Job

1. Open the Job and go to its **Stock** tab.
2. Click **Return to store**.
3. Choose the **Part**, enter the **Quantity**, and set **Length (mm)** for a linear Part.
4. Click **Return stock**.

## From Stock on hand

1. Open **Inventory**.
2. Click **Return to store**.
3. Click **Select Job** and choose the Job.
   The picker opens on **Last updated**; **Last created** and **Not complete** are the other two
   lists. Search reaches every Job — returns are never refused for lifecycle state — by Job code,
   Product, work title, or Customer. The footer says how many of the matching Jobs it has loaded;
   use **Load more** to reach the rest.
4. Choose the **Part**, enter the **Quantity**, and set **Length (mm)** for a linear Part.
5. Click **Return stock**.

A **Stock returned to store** toast confirms it.

## If it warns you

*This return exceeds the quantity currently drawn.* means you are returning more than this Job took
out. Worth a second look — it usually means the return belongs to a different Job, or an earlier
Checkout went against the wrong one. See
[Warnings are judgments, not blocks](./warnings-are-judgments.md).

## Notes

- Returning is always better than posting a negative Checkout. It is the movement built for this,
  and it reverses at the right cost.
- A cancelled Job can still take returns. That is deliberate — material recovered from work that
  never finished would otherwise be stranded off the ledger.
- Returning what is left over is the normal last step before closing a Job out. See
  [Close out a Job's stock](./close-out-a-job.md).
