# Revalue a Part

Revaluing sets a Part's moving average directly. It writes a zero-quantity row to the ledger, so
nothing moves on the rack — only what the stock is worth changes.

This needs cost access. Without it the **Revalue Part** button is not on the screen.

## Steps

1. Open **Inventory**.
2. Click **Revalue Part**.
3. Choose the **Part**.
4. Enter the new cost. The field is **New unit cost**, or **New cost per mm** for a linear Part.
5. Add a **Note (optional)** saying where the figure came from.
6. Click **Post revaluation**.

A **Part revalued** toast confirms it.

## When to use it

When the average is wrong and no movement will fix it — a Receipt posted at a placeholder price, or
stock inherited at a cost nobody recorded. Normal price changes need nothing: the next Receipt
blends the new price in on its own.

## Notes

- Write the note. A revaluation has no quantity and no Job to explain it, so the note is the only
  record of why the number changed.
- Revaluing does not touch what Jobs have already drawn. Stock left at the old average, and a Return
  to Store comes back at what that Job is carrying — see
  [How stock costs work](./how-stock-costs-work.md).
