# Who gets alerts

Alerts are push notifications on the phone app. Who gets one depends on the person's role and, for notes,
which thread they are part of.

## Who gets which alert

| Role | Code Red Breakdown | Code Green Breakdown | Service Due Soon | Breakdown note | Job note |
| --- | :---: | :---: | :---: | :---: | :---: |
| Workshop Manager | ✓ | ✓ | ✓ | ✓ | ✓ |
| Contracting Manager | ✓ | — | ✓ | ✓ | ✓ |
| Contracting Administrator | ✓ | — | ✓ | ✓ | ✓ |
| Super Administrator | ✓ | — | ✓ | ✓ | ✓ |
| Foreman | — | — | — | ✓ | ✓ |
| Contracting Invoicing | — | — | — | — | — |

For notes, ✓ means the role can receive one; it does not mean every person with that role is alerted.
A Breakdown Note reaches its reporter, the Job’s Foreman, anyone who has added a note, and the Workshop
Manager. A Job Note reaches its Foreman, anyone who has added a note, and management (Contracting
Manager, Contracting Administrator and Super Administrator). Neither alerts the person who wrote it. Only people who can still read the thread receive its notes.

Drivers and Mechanics never sign in, so they get no alerts. Equipment roles other than Super
Administrator get none either.

## When each alert comes

| Alert | Sent when | Says | Tapping it opens |
| --- | --- | --- | --- |
| Code Red | A Code Red Breakdown is reported, from the phone or the web. | The Machine or Implement, the first line of the problem, the Farm and Job, and who reported it. | The Breakdown |
| Code Green | A Code Green Breakdown is reported, from the phone or the web. | The same as Code Red. | The Breakdown |
| Service Due Soon | A reading first brings a Machine within its **Service alert hours** of its Next Service Due, or within the Service Due Soon threshold in **Settings** (100 hours unless changed) when it has none. | The Machine and the hours left before its service, or how far past it the reading already is. | The Machine |
| Breakdown note | Someone adds a Breakdown Note. | The Machine or Implement code, the author and a preview of the note’s first line. | The Breakdown’s **Activity** |
| Job note | Someone adds a Job Note. | The Job Number, the author and a preview of the note’s first line. | The Job’s **Activity** |

Each event alerts once. Sending the same Breakdown report again from a phone that lost signal does not
alert again. A Machine already Service Due Soon does not alert again at its next reading; it alerts
again only after a Service Record is closed and the Machine nears its new Next Service Due.

## Who never gets an alert

- Whoever reported the Breakdown does not get its report alert; whoever wrote a note does not get its note alert.
- A shared device, such as a tablet signed in as itself.
- Someone who turned that alert off in the phone app's **Settings**; their other alerts still come. See
  [Choose your alerts](./choose-your-alerts).
- A phone whose notifications are turned off, or where nobody is signed in. A phone only gets the alerts
  of whoever signed in on it last.

To set alerts up on your phone, see [Get alerts](./get-workshop-alerts).
