# Raise Purchase Orders from the buy list

Ticking rows on the **Buy list** and clicking **Create Purchase Orders** turns the selection into
Draft Purchase Orders — one per Supplier — with the quantities already filled in.

## Steps

1. Open **Buy list**. Rows are ranked by when the work needs them, with Parts nothing scheduled is
   waiting on last, under **Not scheduled**.
2. Read **Why**. It says which of three things put the Part here: **Short for Jobs**, **Below
   minimum**, or **Out of stock**.
3. Check **On order** — what is still owed on Sent Purchase Orders, with the order covering it and
   the day it was promised for. **Suggested buy** already has it taken off.
4. Tick the Parts you are ordering.
5. Click **Create Purchase Orders**.
6. Adjust any quantity in the dialog, untick anything you have changed your mind about, then click
   **Create drafts**.
7. Open each draft from **Purchase Orders**. Its lines and quantities are already in place. A line
   starts at the Part's current moving average when one exists; otherwise it shows **Not priced**.
8. Confirm or change each price to what the Supplier agreed.
9. Click **Mark sent**.

## Starting from a Job

A Job's **Stock** tab has the same **Create Purchase Orders** button. It offers the Parts that Job
still has committed, with Free Stock and On Order already taken off, and links every draft it raises
back to the Job — so the order's PDF lands on that Job's Documents tab.

## Notes

- A Built Part can appear on the buy list but can never be ticked: it is made in-house, so there is
  no Supplier to order it from. Build it instead — see [Build stock](./build-stock.md).
- **Late Purchase Orders**, below the buy list, is every Sent order past its expected date with
  lines still owed. Either chase it, or close it short.
- **Minimum Stock** is a field on the Part, edited there like any other Part attribute.
