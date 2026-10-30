# Hour Readings Carry No Photo Evidence

Until now a Contracting Hour Reading could carry a photo of the meter, taken or chosen on the phone or picked on the web, and the server read that photo itself to record an AI value and confidence beside the typed one; a reading without a photo was stamped Missing Photo Evidence, a departure without one had to say why, and management reviewed AI disagreements on Reading Exceptions. With John Deere reporting every linked Machine's hours every hour (ADR 0025), we decided that **an Hour Reading is the typed value and its Read At, with no photo and no AI verification**. The ledger itself is the evidence: a capture is judged against its time neighbours and the nearest Telematics Reading either side, engine hours may not outrun the clock, and a reading out of sequence becomes a Dispute for management. The owner judged the photo and the AI check not worth their cost in field friction, OpenAI calls and review time once a reliable source of hours exists.

## Considered Options

- **Keep the photo, drop the AI check.** Rejected. A photo nobody checks is a chore for the Foreman and a column nobody reads; its one remaining use, the EXIF time, is covered by the capture form asking when the meter was read.
- **Keep both for Machines without a John Deere Link.** Rejected. Two capture flows for one ledger, chosen by a property of the Machine, is the two-patterns smell this codebase refuses; the unlinked minority is checked by its neighbours and the clock rule like every other reading.
- **Remove photo and AI evidence entirely.** Chosen.

## Consequences

- Capture on web and phone is a value, a Read At and an optional comment, for every role. The rule that a photo-less departure must give a reason is gone with the photo.
- `contracting.hour_reading` loses its photo and AI columns and the `photo` method; existing `photo` rows become `manual`. Stored meter photo objects stay in the document store as orphans until an operator sweeps them.
- Reading Exceptions becomes **Disputes**: with AI-flagged readings gone, the page, the dashboard tile and the nav indicator show Disputes only.
- Assignment Attention has one level, critical (a Gap Flag, a Disputed reading); the notice and warning levels, which held only photo and AI kinds, go with them.
- A Field Note is a generic note (description, photos, time) with no path into capture: it no longer saves its photos to the phone's gallery, which existed only for the capture screen to pick one up, and nothing reads a note back into a reading.
- A Machine without a John Deere Link has no evidence beyond its neighbours and the clock rule; a typo within the clock rule's slack passes until a later reading exposes it.
- `@pkg/ai` has no contracting code. The OpenAI model stays for Equipment and Transcriptions.
