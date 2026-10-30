# Capture Job hours

Job hours are a Machine's arrival and departure meter readings on a Job. They are saved on the Machine's stint, not with its spot readings, and the Job bills on the difference.

## On the phone

1. Open the Job and find the Machine.
2. Choose **Start — capture arrival** when it arrives, or **Stop — capture departure** when it leaves.
3. Type the hours on the meter, including the decimal digit.
   - For a Machine linked to John Deere, the line under the hours says what John Deere last read and when. It is never filled in for you.
   - Hours far from John Deere's last reading show an amber warning. Check the meter; you can still save.
   - A departure below the arrival is refused, naming the arrival hours. A departure equal to the arrival is saved with no Work hours.
4. Optionally, add a **Comment**. You can [say it as a Voice Note](./record-a-voice-note) instead of typing it.
5. On an arrival, check the **Implement & driver** and choose **Change** if they differ from the plan.
6. Choose **Save**.

To correct your own hours while the Job is still open, choose **Edit hours** on the Machine, change the arrival or departure hours and their comments, and choose **Save**.

Capturing needs a connection. Without one, [keep a Field Note](./keep-a-field-note) and capture the hours when you are back online.

## On the web

1. Open the Job. Each Machine on the **Machines** card shows its arrival and departure hours, who captured them and when, and what John Deere had read at that moment.
2. Choose **Start — capture arrival** or **Stop — capture departure** on the Machine, then follow the same steps as on the phone and choose **Save hours**.
3. To correct hours, choose **Edit hours** (the pencil beside the hours).
   - Management can edit hours until the Job is Invoiced.
   - Once the Job is signed off, a **Reason** is required. The internal Job Card marks the stint amended.
   - Editing hours on a Priced Job returns it to **Completed**, and its amounts are recomputed.

## Travel Hours

- Travel Hours are worked out when the Machine arrives: its arrival hours less its last departure hours on any Job.
- A Machine with no earlier departure, or one moved by truck, has 0 travel.
- When the arrival is below the Machine's last departure, Travel is set to 0 and the Machine is marked as needing a look.
- Travel is billed at the Machine's rate.
- To change it, choose **Set Travel Hours** (the pencil beside **Travel**). Nothing recalculates Travel once it has been set by hand.

## Needs a look

A Machine is marked amber when:

- Its Travel Hours are over the Travel Flag threshold in [Settings](./maintain-contracting-settings).
- Its Travel was set to 0 because the arrival was below the last departure.
- Its hours are further from John Deere's reading than the John Deere difference threshold.

None of these stops the Job. The only thing that stops sign-off is a Machine still on site.
