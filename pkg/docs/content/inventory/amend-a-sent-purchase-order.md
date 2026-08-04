# Amend a sent Purchase Order

A Draft is edited freely. Once an order is Sent, the Supplier is holding a promise, so it changes by
**amendment** instead: the phone call that changed the order is recorded, and the order re-renders as
a new PDF revision you can send on.

There are three amendments, and no others. Anything wider than these is a new order.

## Change a quantity

1. Open **Purchase Orders** and select the Sent order.
2. On the **Parts** card, click **Change quantity** on the line.
3. Enter the new **Quantity**. It can go up or down.
4. In **Note**, record who agreed the change and why.
5. Click **Change quantity**.

## Add a line

1. On the **Parts** card, click **Add line**.
2. Choose the **Part**. Only the order's own Supplier's Parts appear, and only ones not already on
   the order.
3. Enter the **Quantity** and the agreed **Unit price**.
4. Record the **Note** and click **Add line**.

## Substitute a Part

1. On the **Parts** card, click **Substitute** on the line.
2. Choose the **Substitute Part**, then the **Quantity** and **Unit price** agreed for it.
3. Record the **Note** and click **Substitute Part**.

**Substitute** only appears on a line nothing has arrived against. A Receipt belongs to the line it
arrived on, so swapping the Part underneath it would orphan the delivery. On a line that has taken
stock, change the quantity instead, or send the wrong item back — see
[Return stock to a Supplier](./return-stock-to-a-supplier.md).

## Send the amended order

Every amendment files a new revision in the **Documents** card, named `PO-00042 rev 2.pdf` and up.
Download the newest one and send it: it prints its revision number and says it supersedes the
earlier ones, so the Supplier knows which page to work from. The order as originally sent is never
replaced — it stays in the collection as what was first agreed.

## Notes

- **The Note is mandatory.** A quantity moving on its own says nothing about who agreed to it. The
  **Amendment history** card is read later by someone reconstructing what happened, and the note is
  the only part of the row that tells them.
- A quantity can never go below what the line has already received. The Receipts are facts; an order
  asking for less than it has taken in describes nothing real.
- A Draft has no amendment history, and that is not an omission — it is edited whole, so an empty
  history means "unchanged since it went out".
- An order that has been **closed short** takes no amendments. Closing short asserted the remainder
  is not coming; amending it would take that back.
