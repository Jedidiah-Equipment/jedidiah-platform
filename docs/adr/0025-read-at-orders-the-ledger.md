# Read At Orders the Hour Reading Ledger

John Deere's Operations Center reports each linked Machine's engine hours every hour, and those readings must keep Service Due Soon honest on long Jobs. We decided that **a Telematics Reading joins the one Hour Reading ledger, and Read At orders that ledger**. Until now readings were ordered by acceptance and a capture was judged only against the last-accepted reading; with an hourly feed that rule refuses a Foreman who enters yesterday's departure after today's Deere reading has landed. From here on the **latest reading** is the one with the latest Read At, ties broken by acceptance, and every capture is judged against its **time neighbours**: at or above the nearest reading at or before its Read At, at or below the nearest reading after it. One rule holds for every Machine, linked or not.

## Considered Options

- **A separate telematics fact beside the ledger, with a derived Known Hours.** Rejected. Two ledgers mean two definitions of latest; every reader of hours would have to choose between them, and reporting, which walks the ledger, would ignore the feed.
- **Telematics Readings under acceptance order.** Rejected. An hourly feed is always the last-accepted reading, so every late human capture would be judged against a reading taken after it and refused.
- **Time order.** Chosen.

## Consequences

- A late capture lands in time: a departure dated yesterday sits behind today's readings and moves no hour between Jobs, since an Hour Gap reads the readings its Assignments name.
- A Machine's stints stay in time order: an arrival dated before the Machine's last departure, or a departure dated before its own arrival, is refused. Otherwise a backfilled stint would become another Job's previous departure and move hours on a Job that may already be priced or invoiced.
- A backdated capture is bounded on both sides. Below its previous or above its next it is refused outright (`reading.below_latest`, `reading.above_next`), its sentence naming the reading it contradicts and when, because the fix is its time or its value.
- The dispute handshake stays against the Machine's latest reading only: a capture that becomes the latest and is below it may still assert the latest is wrong.
- Telematics Readings are beyond dispute: a capture against one on either side is refused with no dispute path, and a human reading a Telematics Reading contradicts becomes Disputed for management to amend.
- Utilisation's ledger walk, the amendment range check and the previous departure an Hour Gap starts from read Read At order. A Baseline Reading must still be the Machine's first reading.
- Service Due Soon is judged only when a reading becomes the Machine's latest; a capture dated behind the latest never crosses it.
- The web arrival and departure dialogs take a Read At, as the spot dialog and the phone do. A capture form pre-judges "below the latest" only while its Read At is at or after the latest reading's; a backdated capture is posted and the server's sentence shown.
- ADR 0021's consequence that the ledger is ordered by insertion is replaced by this one.
