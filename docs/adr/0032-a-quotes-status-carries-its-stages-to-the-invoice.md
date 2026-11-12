# A Quote's Status Carries Its Stages to the Invoice

A sold Quote now has to pass three people before it is invoiced: an Administrator completes it, a Super Administrator approves it, and an Administrator enters the Invoice Number. We decided that **the Quote's own status carries those stages**: `awaiting-approval`, `awaiting-invoice` and `invoiced` follow `accepted`, the way a Contracting Job's status runs Completed, Priced, Invoiced. The first stage, **Awaiting pricing**, is not stored. It is derived from an accepted Quote whose work is finished, the way Contracting derives Looks finished from an Active Job, so nobody has to remember to move a Quote into it. Every surface shows the one derived **Quote Stage**, and every reader that used to ask "is this Quote accepted?" asks a named status group instead.

The post-sale statuses are never picked. A Quote moves between them only through named actions with their own permissions (`equipment_quote:price`, `equipment_quote:approve`, `equipment_invoice:update`), and an Invoice Number exists exactly when the status is `invoiced`.

## Considered Options

- **A separate stage field beside a status that stays Accepted.** Rejected. It leaves every existing reader of `accepted` untouched, which is its whole appeal, but it gives a Quote two status-like facts and makes Equipment spell the idea differently from Contracting. One platform, one pattern.
- **Store Awaiting pricing and have an Administrator set it.** Rejected. Product asked for a button; a button can be forgotten, and the point of the chain is that finished work cannot go missing. Job Completion is already a stored fact, so the stage follows from it.
- **Start the chain only from Accepted.** Rejected. Production holds Custom Quotes whose Job ran to completion while still Draft or Sent, some invoiced that way. A finished Job is the proof of the sale, so such a Quote is Awaiting pricing, and sending it for approval is its acceptance.

## Consequences

- `'accepted'` no longer means "a live sale". Use the status groups in `@pkg/schema/equipment` (`soldQuoteStatuses`, `uninvoicedSoldQuoteStatuses`, `presaleQuoteStatuses`); a bare comparison to `'accepted'` is right only where the code means "sold and not yet sent for approval".
- `statusChangedAt` moves on with every stage, so nothing dates a sale from it. `acceptedAt` and `invoicedAt` are the dates reports read.
- A Quote that was sent back returns to `accepted` and counts as Awaiting pricing whatever its Job is doing, so a Quote sent for approval early cannot fall out of every queue.
- Notes and delivery dates never lock: a machine can be invoiced before it is delivered.
