# Approve a Purchase Order

A Purchase Order goes to the Supplier in two steps: procurement drafts it, an administrator approves
it, and only then can it be marked sent. Approving locks the order the same way sending does.

## Steps

1. Open **Purchase Orders** and select the Draft you are signing off.
2. Check the Supplier, the expected delivery date, the lines, and the price on each line. **Preview
   PDF** shows the buyer's view of what is about to go out.
3. Click **Approve**. The Status badge changes to **Approved** and the order can no longer be edited.
4. Click **Mark sent** once the order has gone to the Supplier. The badge stays **Approved** and the
   **Sent** column on the Purchase Orders list gets a tick.

Approving needs **Approve purchase orders**, which only administrators hold. Procurement can draft,
send, amend, receive, and close an order, but never approve one.

## Correcting an approved order

An approved order is read-only, so a mistake found before it is sent is fixed by withdrawing the
approval first.

1. Open the order and click **Revert to draft**. This needs the same **Approve purchase orders**
   permission — only someone who can approve an order can withdraw the approval.
2. Edit the Draft, then approve it again.

Both the approval and the withdrawal are recorded on the order's **Audit** tab with who did it and
when — see [Inspect a Purchase Order's Audit history](./inspect-a-purchase-orders-audit-history.md).

## Notes

- **Approve** is refused on an order with no lines. Add the lines first.
- A line still showing **Not priced** can be approved, but **Mark sent** refuses it and names the
  Part — a receipt against a zero price would record that zero as the Part's cost. Revert to draft,
  set the price, and approve again.
- An approved order that is not going ahead is cancelled like any other order with nothing received
  against it. The sign-off it discards stays in the Audit history.
- Amendments to an order after it is sent do not need a fresh approval. They are recorded and
  attributed on their own — see
  [Amend a sent Purchase Order](./amend-a-sent-purchase-order.md).
- Purchase Orders sent before approval existed read as **Approved**, because sending them was the
  sign-off at the time. Their Audit history shows no separate approval event.
