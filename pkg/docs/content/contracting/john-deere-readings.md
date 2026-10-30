# How John Deere readings work

A **Telematics Reading** is an Hour Reading the Machine's own telematics reported rather than a person captured. Once a Machine is [linked to John Deere](./connect-john-deere), Jedidiah asks John Deere for its engine hours as soon as you link it, a few seconds after Jedidiah starts, and then every hour, and writes the answer into the Machine's readings.

- **Who it is from.** The Machine page and the phone mark the reading **John Deere** where a captured reading names the person.
- **Same hours again.** When John Deere reports the same hours and nothing else was read in between, the reading's time moves forward to the new report instead of adding a row. The ledger then says the hours still stand as of the latest report.
- **Beyond dispute.** Nobody amends or disputes a John Deere reading.
- **Out of sequence.** A captured reading that sits out of sequence with a John Deere reading becomes **Disputed** and lands on **Disputes**. Management corrects its hours or Read At back into sequence with a reason, as in [Resolve a Dispute](./resolve-a-dispute). The Foreman is never asked about it.
- **Service Due Soon.** A John Deere report that brings a Machine within its **Service Alert Hours** of its next service sends the same Service Due Soon push a field capture sends.
