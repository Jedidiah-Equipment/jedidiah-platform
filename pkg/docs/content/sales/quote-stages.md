# Quote Stages

Every sold Quote passes the same four **Stages** on its way to an invoice. Each open Stage is one
person's queue, so a finished sale cannot go missing before it is invoiced.

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
