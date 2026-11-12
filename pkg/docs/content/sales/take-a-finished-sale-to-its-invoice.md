# Take a finished sale to its invoice

A sold Quote moves through its [Quote Stages](/sales/quote-stages) one person's queue at a time; the
Quote's **Stage** card shows where it stands and the buttons your role has. A button the Stage does not
allow yet is greyed out; point at it to see why.

## Find a Quote on the Invoicing page

**Invoicing**, under Operations, lists every sold Quote from Awaiting pricing through Invoiced.

- It opens on the three open stages, the Quotes whose Job finished longest ago on top. Quotes with no
  Job completed date, such as a Parts Sale, come last. When nothing is open, it lists the Invoiced Quotes.
- Click a stage above the table to see only its Quotes, with the count beside each. **All** includes
  Invoiced.
- Find Invoiced Quotes through the **Stage** column filter, or pick dates on the **Invoiced** column to
  see what was invoiced on those days.
- Click a row to open the Quote.

## Send a Quote for approval

1. Open the Quote and complete it. On any Quote that means its discount, deposit, Delivery Terms and
   Delivery Price; on a Custom Quote, its Work Items too. A Product Quote's machine and Optional
   Assemblies stay as sold: bill extra work on a Custom Quote or Parts Sale beside it.
2. On the **Stage** card, click **Send for approval** and confirm.

Delivery Terms must be confirmed first: a Quote whose delivery is **To be confirmed** cannot be sent.
Sending a Draft or Sent Custom Quote for approval also accepts it.

## Approve a Quote, or send it back

A Super Administrator reviews each Quote Awaiting approval and may still change its Work Items and
Settling Terms.

- Click **Approve** when it is right. It moves to Awaiting invoice.
- Click **Send back** when something needs to change, and say what in the note. The Quote returns to
  Awaiting pricing and shows your note, with your name and the date, until it is sent again.

A Quote Awaiting invoice can still be sent back the same way.

## Enter the Invoice Number

1. Create the invoice in the accounting system.
2. On the Quote's **Stage** card, click **Enter Invoice Number**, or click **Stamp** on its row on the
   Invoicing page.
3. Type the number and click **Invoice**.

One accounting invoice can cover several Quotes, so the same number may go on more than one. The dialog
lists the other Quotes already carrying the number you type; it never refuses it. A deposit invoice is not
recorded separately: each Quote carries one Invoice Number.

## Correct or remove an Invoice Number

- **Correct** fixes a mistyped number. The Quote stays Invoiced.
- **Remove** takes the number off and returns the Quote to Awaiting invoice. Only a Super Administrator
  can remove one. An Invoiced Quote has to lose its number before it can be
  [cancelled](/sales/cancel-a-quote).
