# Record a credit note

When stock goes back to a Supplier, the Supplier owes a credit. The credit note they send is filed
against the Purchase Order, and it records **which returns it settles** — that reference is what
takes those returns off the awaiting-credit list.

## Steps

1. Open **Purchase Orders** and select the order the stock went back on.
2. On the **Returns to Supplier** card, click **Record credit note**.
3. Choose the credit note **PDF**.
4. Tick every return this credit note settles. Only returns nothing has credited yet are listed.
5. Click **File credit note**.

The credit note joins the **Documents** card alongside the order's own PDF revisions, and the returns
it settles change from **Awaiting credit** to naming the credit note.

## Notes

- **Tick the actual returns.** The tick list is the whole point of the upload. A credit note filed
  against nothing leaves the returns it paid for on the awaiting-credit list forever.
- One credit note per return. The Supplier credits the original invoice one-to-one, so a return that
  already names a credit note cannot be ticked again.
- One credit note can settle several returns at once, and an order that sent three things back and
  got one credit still shows the other two as **Awaiting credit** — which is correct, and is why the
  reference is per return rather than per order.
- Credit notes stay on the Purchase Order. They are not projected onto linked Jobs the way the order
  PDF is: a credit answers a return to the Supplier, not the work on the Job.
