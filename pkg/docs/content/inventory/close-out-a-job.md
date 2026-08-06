# Close out a Job's stock

Closing out says a completed Job's stock life has ended. It releases whatever that Job still had
committed, so the demand stops eating into Free Stock. It is recorded once, and it does not come
back.

## Steps

1. Open **Close-out**. The queue lists every completed Job still holding drawn stock or open
   commitment, oldest first — **Waiting** is how long it has been there.
2. Click the Job's row.
3. Read the line under the title. It tells you where the Job stands, including when it cannot be
   closed out yet.
4. Return anything still on the floor. Each Part row with stock drawn against it has a **Return**
   button — see [Return to Store](./return-to-store.md).
5. Click **Material variance** to see what the Job planned against what it took before you end its
   stock life — see [Read a Job's material variance](./read-a-jobs-material-variance.md).
6. Click **Close out**.
7. In the **Close out Job stock** dialog, add a **Note** if there is anything worth recording, then
   click **Close out**.

The Job leaves the queue. It also leaves on its own if it ends up with nothing outstanding to close.

Closing out is permanent and releases the Job's remaining commitment — what that means for Free
Stock is in [Stock on hand, Commitment, and Free
Stock](./stock-on-hand-and-free-stock.md#how-a-commitment-ends).

## Notes

- A Job that has not been completed yet cannot be closed out, and the page says so rather than
  offering the button.
- A cancelled Job is never closed out. Return anything it still holds; there is nothing left to
  close.
- The days in **Waiting** are the signal worth watching. A Job sitting in the queue for weeks is
  holding commitment against stock nobody is going to draw.
