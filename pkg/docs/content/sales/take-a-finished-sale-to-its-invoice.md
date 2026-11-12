# Take a finished sale to its invoice

Every sold Quote passes the same four **Stages** on its way to an invoice. Each open Stage is one
person's queue, so a finished sale cannot go missing before it is invoiced. The Quote's **Stage** card,
at the top of the right-hand panel, shows where it stands and the buttons you may use there.

| Stage | What it means | Who acts |
| --- | --- | --- |
| **Awaiting pricing** | The work is finished. The Quote needs completing before it is approved. | An Administrator completes it and sends it for approval. |
| **Awaiting approval** | It waits for review. Nobody else can change it meanwhile. | A Super Administrator approves it or sends it back. |
| **Awaiting invoice** | Approved and frozen for everyone. | An Administrator enters the Invoice Number. |
| **Invoiced** | The Invoice Number is recorded. Only the notes and delivery dates still change. | An Administrator can correct the number; only a Super Administrator can remove it. |

## When a Quote reaches Awaiting pricing

Nobody sets it by hand:

- A Quote is Awaiting pricing once its Job is completed. A Custom Quote gets there even while it is
  still **Draft** or **Sent**, because the finished Job is the proof of the sale.
- A Parts Sale, or a From Stock Quote with no Job, is Awaiting pricing as soon as it is accepted.
- A Quote that was sent back is Awaiting pricing, whatever its Job is doing.

An accepted Quote whose work is still under way reads **Accepted**. It can be sent for approval early, so
a sale can be invoiced before its work finishes.

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
2. On the Quote's **Stage** card, click **Enter Invoice Number**.
3. Type the number and click **Invoice**.

One accounting invoice can cover several Quotes, so the same number may go on more than one. The dialog
lists the other Quotes already carrying the number you type; it never refuses it. A deposit invoice is not
recorded separately: each Quote carries one Invoice Number.

## Correct or remove an Invoice Number

- **Correct** fixes a mistyped number. The Quote stays Invoiced.
- **Remove** takes the number off and returns the Quote to Awaiting invoice. Only a Super Administrator
  can remove one. An Invoiced Quote has to lose its number before it can be
  [cancelled](/sales/cancel-a-quote).
