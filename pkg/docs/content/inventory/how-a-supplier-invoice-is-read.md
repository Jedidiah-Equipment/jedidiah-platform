# How a Supplier invoice is read

Filing a Supplier invoice against a Purchase Order sends the PDF to our AI provider, which
transcribes it once. That transcription is stored with the invoice and is the whole of what the AI
produces — everything the panel then shows you is worked out from it here.

## What it transcribes

The billed lines in the order they appear, each with its description, quantity, unit price and line
total; the invoice number and date; and any Part or Job codes the Supplier echoed back. Job codes are
worth transcribing because Suppliers print them unprompted, which makes them free hints about what a
line was for.

## What it never does

- **It never invents a number.** A figure the invoice does not print comes back empty rather than
  calculated or inferred. A guessed price would be indistinguishable from a real disagreement, and a
  busy desk would apply it without looking.
- **It does not match, flag, or price anything.** Matching each billed line to an order line, raising
  the flags, and posting a Revaluation all happen outside the AI — by the app, and by you.
- **It changes nothing on its own.** No order, no price, and no ledger row moves because of a read.
- **It reads once.** The transcription is kept, so opening the order again shows the same read rather
  than sending the PDF off a second time.

## Why filing takes a moment

The read happens inside the upload rather than afterwards, so filing an invoice waits on the
transcription in a way that filing an ordinary document does not.

A read that fails is a supported outcome, not an error: the invoice is filed exactly as it would
otherwise have been and reads as one nobody could make sense of, leaving the prices on that order to
be checked by hand. Nothing else about the order is affected.
