# Receive a delivery

Receiving is checking a delivery in against its Purchase Order, and what it posts is a **Receipt**.
A Receipt attaches to one line of one Purchase Order, and posting it *is* the moment the stock
exists — there is no separate paper step afterwards.

## Steps

1. Open **Purchase Orders** and select the order the delivery is against.
2. Find the **Receiving** card. Each line shows **Received** as a running `x / y`, and
   **Outstanding** as what is still to come.
3. Click **Receive** on the line that arrived.
4. Check **Quantity received**. It is prefilled with the outstanding quantity, which is right when
   the delivery completes the line and wrong when it is a part delivery — change it to what actually
   arrived.
5. For a linear Part, set **Length (mm)** only if the pieces came in a length other than the
   standard one. Leave it blank otherwise; the field tells you which length it will assume.
6. If you have cost access, leave **Unit cost override** blank to use the Purchase Order price. Fill
   it only when the invoice disagrees with the order.
7. Click **Receive**. If the delivery is bigger than the line ordered, the button reads **Receive it
   anyway** — click it once you have read the panel and the delivery really was that size.

A **Delivery received** toast confirms it, and the Part's stock on hand goes up immediately.

## If it warns you

Receiving more than the line ordered raises *This receipt takes the line past the quantity ordered.*
in the yellow panel while you type, and the button becomes **Receive it anyway**. Posting it is
usually right; suppliers round up to a full box. See
[Warnings are judgments, not blocks](./warnings-are-judgments.md).

## Notes

- On the stores tablet, receiving starts from the stock rather than the order: scan the Part label,
  tap **Receive against an order**, and tap the Purchase Order the delivery belongs to. See
  [Work the stores tablet](./work-the-stores-tablet.md).
- Receive against the line the stock actually arrived for. A Receipt is a fact about one line, and
  posting it against a convenient one instead makes both lines wrong.
- Split deliveries are normal: receive what came, and the line stays open with the rest outstanding.
- Once a line has received anything, a **Print label** button appears next to it. Labels go on stock
  that has landed — see [Print Part Labels](./print-part-labels.md).
- Periodic Parts accept Receipts like any other Part. That Receipt is the baseline their next count
  corrects — see [Perpetual and periodic Parts](./perpetual-and-periodic-stock.md).
