# Raise a Parts Sale

A Parts Sale is a Quote for loose or machined parts sold straight to a Customer. It is priced from Work
Items like a Service Work Quote, labour included, but it never becomes a Job.

Raise **Service Work** instead when the parts are being fitted, or when the work needs a Bay, a schedule,
or Department timing. A Parts Sale cannot be turned into Service Work later; raise a new Quote.

1. On **Quotes**, select **New quote**.
2. Pick the **Customer**.
3. Set **Type** to **Parts Sale**. The **Work title** fills in as `Parts sale`; change it if a better name
   helps the Customer.
4. Pick the **Salesperson** and **Status**, then select **Save**.
5. On the Quote, add a Work Item for the parts, and
   [add inventory parts](/sales/add-an-inventory-part-to-a-quote) or type the rows in. Machine time on a
   CNC'd part goes in the Work Item's hours.
6. Send and accept the Quote as usual.

An accepted Parts Sale stays out of **Awaiting Job Creation** and the Job Start Alert, and it has no
**Start Job**. Its labour is only a charge: nothing is scheduled, timed, or counted in build metrics.

Once it is billed, enter the **Invoice Number** on the Quote. That is the record that the sale was invoiced.

## Checking the parts out

Parts that leave stores for the sale are checked out to the Parts Sale, so they are traceable to it. See
[Check out Parts](/inventory/check-out-parts-to-a-job#to-a-parts-sale).

The Quote's **Stock drawn** panel lists every Part still out against the sale, net of returns, with its
lengths. Anyone who can see inventory sees the panel; the **Value** column shows only to those who can see
inventory costs. Stores can **Check out** and **Return to store** from it. Check out is gone once the sale
is rejected or cancelled, but returns stay open.

Cancelling a Parts Sale with stock still out lists that stock in the cancel dialog. Cancelling does not
return it; post a [Return to Store](/inventory/return-to-store#from-a-parts-sale) against the Quote for
anything that comes back.
