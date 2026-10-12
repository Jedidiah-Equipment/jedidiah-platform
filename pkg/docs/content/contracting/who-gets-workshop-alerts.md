# Who gets workshop alerts

Workshop alerts are push notifications on the phone app. Who gets one depends on the person's role, and
when it comes depends on what happened in the field.

## Who gets which alert

| Role | Code Red Breakdown | Code Green Breakdown | Service Due Soon |
| --- | :---: | :---: | :---: |
| Workshop Manager | ✓ | ✓ | ✓ |
| Contracting Manager | ✓ | — | — |
| Contracting Administrator | ✓ | — | — |
| Super Administrator | ✓ | — | — |
| Foreman | — | — | — |
| Contracting Invoicing | — | — | — |

Drivers and Mechanics never sign in, so they get no alerts. Equipment roles other than Super
Administrator get none either.

## When each alert comes

| Alert | Sent when | Says | Tapping it opens |
| --- | --- | --- | --- |
| Code Red | A Code Red Breakdown is reported, from the phone or the web. | The Machine or Implement, the first line of the problem, the Farm and Job, and who reported it. | The Breakdown |
| Code Green | A Code Green Breakdown is reported, from the phone or the web. | The same as Code Red. | The Breakdown |
| Service Due Soon | A reading first brings a Machine within 100 hours of its Next Service Due. | The Machine and the hours left before its service, or how far past it the reading already is. | The Machine |

Each event alerts once. Sending the same Breakdown report again from a phone that lost signal does not
alert again. A Machine already Service Due Soon does not alert again at its next reading; it alerts
again only after a Service Record is closed and the Machine nears its new Next Service Due.

## Who never gets an alert

- Whoever reported the Breakdown, even when their role would otherwise get it.
- A shared device, such as a tablet signed in as itself.
- A phone whose notifications are turned off, or where nobody is signed in. A phone only gets the alerts
  of whoever signed in on it last.

To set alerts up on your phone, see [Get workshop alerts](./get-workshop-alerts).
