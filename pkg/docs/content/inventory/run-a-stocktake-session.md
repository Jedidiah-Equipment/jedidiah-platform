# Run a stocktake session

A stocktake session is one counting walk: you open it with a scope, count Part by Part, and close
it. Each count posts a Stock Movement for the difference between what you counted and what the
ledger held at that moment — it never overwrites the quantity. Raw material is counted weekly in one
sitting; stores is counted monthly and may roll over several days.

## Open or resume a session

1. On the stores tablet, tap **Stocktake** under **Other work**.
2. Make sure your name is on the tablet. A count is attributed to a person, so the tablet will not
   open a session for nobody.
3. Tap **Raw material** or **Stores**. If a session is already open for that scope, the tile says so
   and tapping it carries on where the last shift left off.

## Count a Part

1. Scan the bin or the item. You can also tap a Part in **Still to count**.
2. Key what you can actually see. The tablet does not show you the recorded quantity while you are
   counting — that is deliberate, so the count is yours and not the system's.
3. For a linear Part, key the pieces per length. Lengths already on the rack are listed; use **A
   length that is not listed** to add one for an offcut. Key **0** for a length that is finished —
   a count has to say a length is empty, and one left blank that the system still holds stock in is
   refused rather than written off.
4. Tap **Check this count**. The tablet now shows what was expected beside what you counted.
5. If it looks wrong, tap **Recount** and count again — nothing has been recorded yet.
6. Tap **Post count**. The difference is posted and the Part leaves **Still to count**.

A count that agrees with the ledger is still worth posting: it is what records that the Part was
counted at all.

## Close the session

1. Tap **Close this session**.
2. Read the skipped list. Anything named there keeps its recorded quantity until the next walk.
3. Tap **Close it**, or **Keep counting** to go back.

A closed session cannot be reopened, and no further counts can be posted against it.

## Read the variance report

Open **Stocktake** in the web app for the session history. A session's page lists every Part
counted, what was expected, what was counted, and the variance — priced, if you can see inventory
costs — followed by what the walk skipped.

For a closed raw-material session with an earlier raw-material session, a cost reader also sees
**Expected vs actual raw-material consumption**. Expected consumption adds the Product Material
Lists for Product Jobs completed between those sessions; actual depletion comes from the physical
count. Expected is a floor because a Job without a completion date cannot be placed in the window.

The two tiles at the top of that page say whether each scope is up to date. Raw material is due a
week after the last close; stores is due a month after it. Each gets a couple of working days'
grace before it is called overdue.

## Notes

- A Part belongs to the scope its Stock Tracking Mode implies: periodic Parts are counted in the
  raw-material walk, perpetual Parts in the stores walk. See [Perpetual and periodic
  Parts](./perpetual-and-periodic-stock.md).
- Counting the same Part twice in a session is allowed. The second count is measured against what
  the ledger holds after the first, so it corrects rather than doubles.
- A count that takes a Part to zero puts it on the out-of-stock list, exactly as any other movement
  to zero would.
- Stock received in the middle of a session is not counted away. Each count is measured against the
  ledger at the moment it is posted, and a delivery that arrives while you are at the rack stops the
  post rather than being written off — the new length appears on the screen for you to count.
