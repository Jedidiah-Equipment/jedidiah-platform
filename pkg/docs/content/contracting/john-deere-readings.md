# How John Deere readings work

A **Telematics Reading** is an Hour Reading the Machine's own telematics reported rather than a person captured. Once a Machine is [linked to John Deere](./connect-john-deere), Jedidiah asks John Deere for its engine hours as soon as you link it, a few seconds after Jedidiah starts, and then every hour, and writes the answer into the Machine's readings.

- **Who it is from.** The Machine page and the phone mark the reading **John Deere** where a captured reading names the person.
- **Same hours again.** When John Deere reports the same hours and nothing else was read in between, the reading's time moves forward to the new report instead of adding a row. The ledger then says the hours still stand as of the latest report.
- **Never amended.** Nobody amends a John Deere reading, and a spot reading that contradicts one is refused.
- **Job hours.** Arrival and departure hours typed on a Job are compared to John Deere's latest reading. Further apart than the **John Deere difference threshold** in [Settings](./maintain-contracting-settings), the capture screen warns and the Machine on the Job is marked as needing a look. Nothing is blocked. See [Capture Job hours](./capture-job-hours).
- **Known hours.** A Machine's known hours are the higher of its latest reading, John Deere's included, and its latest Job hours.
- **Service Due Soon.** A John Deere report that brings a Machine within its **Service Alert Hours** of its next service sends the same Service Due Soon push a field capture sends.
