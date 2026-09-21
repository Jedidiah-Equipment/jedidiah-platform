# Amend a sent Purchase Order

A Draft is edited freely. Once an order is Sent, the Supplier is holding a promise, so it changes by
**amendment** instead: the phone call that changed the order is recorded, and the order re-renders as
a new PDF revision you can send on.

The order can change its expected date, its Part Lines, or its Custom Lines. Anything wider is a new order.

## Change the expected delivery date

1. Open **Purchase Orders** and select the order, which the **Sent** column shows has gone out.
2. On **Order details**, click **Change expected date**.
3. Choose the Supplier's new **Expected delivery date**.
4. Record the **Note** and click **Change expected date**.

The date change appears in **Amendment history** and creates the next PDF revision. A past date also
makes an order with outstanding lines appear under **Late Purchase Orders**.

## Change a quantity

1. Open **Purchase Orders** and select the order, which the **Sent** column shows has gone out.
2. On the **Lines** card, click **Change quantity** on a Part Line, or **Amend quantity** on a Custom Line.
3. Enter the new **Quantity**. It can go up or down.
4. In **Note**, record who agreed the change and why.
5. Click **Change quantity**.

## Add a line

1. On the **Lines** card, click **Add line**, then **Add Part**.
2. Choose the **Part**. Only the order's own Supplier's Parts appear, and only ones not already on
   the order.
3. Enter the **Quantity** and the agreed **Unit price**.
4. Record the **Note** and click **Add line**.

To add a Custom Line, choose **Add line** → **Add custom line** instead. Enter its description,
unit, optional Supplier code, quantity, agreed unit price, and the mandatory note; click
**Add custom line**. A Supplier needs no catalogue Parts for this option. An unpriced line cannot
be added to a Sent order.

## Remove a Custom Line

1. On the **Lines** card, click **Remove line** on a Custom Line that has no Arrival history.
2. Record why it is being removed in **Note**, then click **Confirm remove line**.

The last line on an order cannot be removed; cancel the order instead. Even a fully reversed
Arrival is history, so that line cannot be removed. Its description remains in Amendment history.

## Substitute a Part

1. On the **Lines** card, click **Substitute** on a Part Line.
2. Choose the **Substitute Part**, then the **Quantity** and **Unit price** agreed for it.
3. Record the **Note** and click **Substitute Part**.

**Substitute** is disabled on a line that has taken stock, with the reason shown on the action. A
Receipt belongs to the line it arrived on, so swapping the Part underneath it would orphan the
delivery. Change the quantity instead, or send the wrong item back — see
[Return stock to a Supplier](./return-stock-to-a-supplier.md).

## Send the amended order

Every amendment files a new revision in the **Documents** card, named `PO-00042 rev 2.pdf` and up.
Click **Preview** on the newest one and download it from the panel that opens, then send it: it
prints its revision number and says it supersedes the earlier ones, so the Supplier knows which page
to work from. The order as originally sent is never replaced — it stays in the collection as what
was first agreed.

## Notes

- **The Note is mandatory.** A quantity moving on its own says nothing about who agreed to it. The
  **Amendment history** card is read later by someone reconstructing what happened, and the note is
  the only part of the row that tells them.
- A quantity can never go below what the line has already received. The Receipts are facts; an order
  asking for less than it has taken in describes nothing real. For a Custom Line, its Arrivals are
  the corresponding facts.
- A Draft has no amendment history, and that is not an omission — it is edited whole, so an empty
  history means "unchanged since it went out".
- An order that has been **closed short** takes no amendments. Closing short asserted the remainder
  is not coming; amending it would take that back.
