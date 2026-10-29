# Connect John Deere

The John Deere Connection is Contracting's one link to the owner's John Deere Operations Center organization, made with the owner's John Deere sign-in.

## Connect

1. In Jedidiah Contracting, open **Settings** under Admin and choose the **John Deere** tab. It reads **Not connected**.
2. Choose **Connect**. The browser goes to John Deere.
3. Sign in with the owner's John Deere sign-in and accept what Jedidiah asks to read.
4. If John Deere asks which organization Jedidiah may use, choose the owner's organization and confirm.
5. The browser comes back to the tab, which reads **Connected** with the organization's name and who connected it when.

## Reconnect

1. Choose **Reconnect** when the tab reads **Needs reconnecting**. The tab says why: John Deere stopped accepting the sign-in, or no organization gave Jedidiah access.
2. Follow steps 3 to 5 of Connect. A Connected connection keeps working until the new sign-in finishes.

## Link a Machine

A John Deere Link pairs one Machine with one machine in the organization.

1. On a **Connected** tab, find the machine under **Unlinked John Deere machines**. Choose **Refresh** to ask John Deere again.
2. Choose **Link** on its row and pick the Machine. Only Machines that are not retired and not linked are offered.
3. Compare the two meters side by side: John Deere's last reported hours beside the Machine's latest reading and its Read At. Link only when the two meters agree for the time between them.
4. Choose **Link**. The machine moves to **Linked Machines**, its PIN becomes the Machine's serial number, and its hours are read from John Deere straight away. A PIN another Machine already holds is refused.

## Refresh now

Jedidiah reads each linked Machine's hours from John Deere a few seconds after it starts and then every hour; [how John Deere readings work](./john-deere-readings) explains what lands on the Machine's readings.

1. On a **Connected** tab, choose **Refresh now** to read John Deere straight away instead of waiting for the hour.
2. Read the message that follows. A run John Deere cut short says why, and the Machines it did not reach are read in the next hour.
3. Under **Linked Machines**, check any row that reads **Lost**: John Deere no longer lists that machine. It clears when John Deere lists it again.

## Unlink a Machine

1. Under **Linked Machines**, choose **Unlink** on the Machine's row and confirm.
2. The Machine keeps its serial number and every reading already stored.

## Disconnect

1. Choose **Disconnect** on a tab that reads **Connected** or **Needs reconnecting**.
2. Confirm. Jedidiah forgets the John Deere sign-in and reads nothing from John Deere until someone connects again. Links stay.

A tab that reads **Not configured** means this environment has no John Deere application keys yet. Only a **Contracting Administrator** or a **Super Administrator** can open the tab.
