# Raise Purchase Orders from the buy list

The **Buy list** is every Part the shop is short of, in one place. Ticking rows and clicking
**Create Purchase Orders** turns a selection into draft orders — one per Supplier — with the
quantities already filled in.

Nothing on the buy list ever orders anything by itself.

## Steps

1. Open **Buy list**. Rows are ranked by when the work needs them: the Part a Job starts on soonest
   is at the top, and Parts nothing scheduled is waiting on sit at the bottom under **Not
   scheduled**.
2. Read **Why** on each row. A Part can be there for more than one reason at a time:
   - **Short for Jobs** — Free Stock has gone negative; open Jobs want more than the shelf holds.
   - **Below minimum** — stock on hand has dropped under the Part's minimum stock level.
   - **Out of stock** — there is nothing on the shelf at all.
3. Check **On order** before ordering anything. It is what is still owed on sent Purchase Orders,
   with the order that covers it and the day it was promised for — "PO-00042, expected 12 Aug".
4. Read **Suggested buy**. It is the shortfall with **On order** already taken off, so a Part
   already covered by a sent order suggests nothing.
5. Tick the Parts you are ordering.
6. Click **Create Purchase Orders**.
7. In the dialog, adjust any quantity that needs it, then click **Create drafts**.

Each new draft opens with its lines and quantities in place and **no prices**. Open it from
**Purchase Orders**, key the agreed prices, and send it — see
[Post a Receipt](./post-a-receipt.md) for what happens when the stock arrives.

## Starting from a Job

A Job's **Stock** tab has the same **Create Purchase Orders** button. It offers the Parts that Job
still has committed, with free stock already netted off, and links every draft it raises back to the
Job — so the order's PDF lands on that Job's Documents tab.

## Notes

- A Built Part can appear on the buy list but can never be ticked. It is made in-house, so there is
  no Supplier to order it from — build it instead (see [Build stock](./build-stock.md)).
- The buy list shows quantities only, never prices. Prices belong on the draft.
- **Late Purchase Orders**, below the buy list, is every sent order past its expected date with
  lines still owed. Either chase it, or close it short so its remainder stops counting as cover.
- Minimum stock is a field on the Part, edited on the Part like any other attribute. A Part with no
  minimum simply never appears for that reason.
