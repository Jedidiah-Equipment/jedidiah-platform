# Mobile Capture Is Online Only

A Foreman captures an Hour Reading as one request to the server, which judges it under the Machine lock as the ledger's only truth. Without a connection the app captures nothing: the Foreman keeps a Field Note on the phone (description, photos, time) and enters it once signal returns. Offline capture is 2 to 5 percent of field work, and the platform accepts a manual re-entry step at that rate rather than a second, phone-side copy of the ledger's rules and state.

## Considered Options

- **A local capture queue with background sync.** Rejected. It needs the phone to hold a queue-aware projection of Jobs, stints, on-site Machines and each Machine's latest reading, to judge captures by the server's rules before they are sent, and to give the Foreman a tray for captures the server later refuses. That machinery serves every capture to cover a rare one, and its failure modes (a late-synced capture judged against a ledger that moved on, a photo lost before upload) fall on the Foreman in the field.
- **Read-only offline browsing of Jobs and Machines.** Rejected. Nothing offline can act on it, and the Foreman is standing next to the Machine.

## Consequences

- Every Contracting screen except Field Notes sits behind the app's offline cover, the same cover Equipment uses.
- A Field Note is never read back into a Job or Machine by the app; the Foreman transcribes it. Its photos are saved to the phone's gallery so the capture screen can pick them up.
- An Hour Reading's Read At time is the Foreman's word, defaulted from the capture moment or the chosen photo's timestamp; the server refuses only a future time and orders the ledger by insertion, never by Read At.
- Server-side idempotent replay by the phone's capture id and the dispute handshake remain for retried and racing online requests.
- Builds from before this decision kept a reading queue, its meter photos and copies of the fleet and Jobs on
  the phone. The app deletes them, unread, at start; that purge is itself deleted from 1 January 2027.
