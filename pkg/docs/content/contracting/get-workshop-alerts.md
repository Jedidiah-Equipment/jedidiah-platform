# Get workshop alerts

The phone app sends the workshop a push notification when a Breakdown is reported and when a Machine becomes Service Due Soon, so nobody has to watch the queue.

Who gets which alert:

- **Code Green** Breakdown: the workshop manager.
- **Code Red** Breakdown: the workshop manager, the contracting managers and admins, and super-admins.
- **Service Due Soon**: the workshop manager, once, at the reading that first brings a Machine within reach of its Next Service Due. Closing a Service Record moves Next Service Due on, and the alert comes again when the Machine nears it.

Whoever reported a Breakdown never gets their own alert. Foremen get no alerts.

1. Sign in to the phone app with your own account.
2. When the app asks to send notifications, choose **Allow**. It asks only once.
3. When an alert arrives, tap it. A Breakdown alert opens the Breakdown; a service alert opens the Machine.

## Turn alerts back on

If you chose **Don't Allow**, the app does not ask again.

1. Open the phone's **Settings** and find the Jedidiah app.
2. Turn **Notifications** on.
3. Open the app again; alerts start arriving from then on.

Signing out while online stops alerts to that phone. A phone delivers alerts to whoever signed in on it last.
