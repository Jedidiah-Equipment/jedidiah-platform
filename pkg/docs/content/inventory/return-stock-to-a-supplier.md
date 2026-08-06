# Return stock to a Supplier

A Return to Supplier sends stock back off the Purchase Order line it arrived on. It reverses at the
price that line was received at, so the value leaving is exactly the value that came in — the Part's
average cost is untouched.

This is not the same as a [Return to Store](./return-to-store.md), which puts a Job's leftovers back
on the rack.

A **Stores** user or **Procurement manager** can post this Purchase Order-bound return; Procurement
does not gain permission to Checkout stock or Return it to Store.

## Steps

1. Open **Purchase Orders** and select the order the stock arrived on.
2. Find the **Returns to Supplier** card and click **Return** for the Part going back.
3. Check **Quantity returned**. It is prefilled with everything that line has received and not yet
   sent back.
4. Choose the **Reason**:
   - **Wrong item** — not what was ordered.
   - **Defective** — the right item, unusable.
   - **Order error** — we ordered the wrong thing.
5. For a linear Part, set **Length (mm)** only if the pieces going back are a length other than the
   standard one.
6. Add a **Note** if there is anything to say about what the Supplier was told.
7. Click **Post return**.

A **Return to Supplier posted** toast confirms it, and stock on hand goes down immediately.

## If it warns you

*This return sends back more than the line ever received.* is almost always a scan error — the wrong
line, or a quantity typed twice. Look again before accepting. As with every stock warning it does not
block: the stock physically left the building, and refusing the row would only hide that. See
[Warnings are judgments, not blocks](./warnings-are-judgments.md).

## What the reason decides

The reason is not just a label — it decides whether the order is still waiting on the goods.

- **Wrong item** and **Defective** mean a replacement is coming. The line re-opens: its **Received**
  count drops back, the order goes back to **Partially received** — or to plain **Sent**, if
  everything the line took in went back — the shortfall counts as **On order** again, and the
  replacement delivery is received without an over-receipt warning.
- **Order error** means we asked for the wrong thing and want nothing in its place. The line stays as
  received; close the order short if there is an unrelated remainder nobody is waiting on.

If the replacement never comes and you no longer want it, **close the order short**. That works even
when everything received went back and the order reads **Sent** again: its receipts are real history,
so it is closed short rather than cancelled, and the released remainder stops counting as **On
order**.

## Notes

- Nothing refused at the dock is returned. A refused delivery was never received, so there is no
  Receipt to reverse and nothing to record.
- A return needs a Receipt behind it. A line nothing arrived on has nothing to send back.
- Once a line has moved stock either way, its Part can no longer be substituted — the movements
  belong to that line. See [Amend a sent Purchase Order](./amend-a-sent-purchase-order.md).
- Every return leaves the Supplier owing a credit. Record it when it arrives — see
  [Record a credit note](./record-a-credit-note.md).
- Raw material returns like anything else. Its ledger refuses *consumption*, and a return reverses an
  arrival rather than recording use.
