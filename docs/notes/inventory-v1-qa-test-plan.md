# Inventory v1 — QA Test Plan

Manual test plan covering every inventory surface shipped for the v1 spec
([#889](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/889),
`docs/notes/inventory-v1-spec.md`, tickets #1047–#1062).

**In scope:** Parts catalog · barcode labels · stock on hand & movements · costing & the cost
gate · Purchase Orders (draft → sent → receive → amend → return → invoice → close) · Suppliers ·
buy list & on-order · Job checkout, commitment & close-out · material variance · Built Parts &
builds · stocktake sessions · the stores tablet (device + quick-switch) · product cost
estimation · permissions · nav signals · help links.

**Out of scope:** the Inventory KPI dashboard (#1074 — still open), the go-live checklist
(spec §14: catalog migration, opening balances, hardware), and the JedOps visibility backlog
(#1075, #1076).

**How to work this plan:** run the suites in order — later suites lean on data created by
earlier ones. Tick each case and note the actual result for any failure. "Refused" means the
server rejects the write with an error; "warns" means a warning is shown but posting is still
allowed — the two are never interchangeable.

---

## 0 · Environment & personas (SETUP)

Fresh environment: `pnpm db:up && pnpm db:seed`, then start dev services. Every seeded user
signs in with password `test123`. The stores tablet is the Expo mobile app.

Personas (seeded):

| Persona | Login | Role | Inventory posture |
|---|---|---|---|
| Admin | `factory@jedidiahequipment.co.za` | admin | everything |
| Procurement | `parts@jedidiahequipment.co.za` | procurement-manager | read/adjust, full costs & POs, **no move** |
| Sales | `accounts@jedidiahequipment.co.za` | sales | **no inventory at all** |
| Bay operator | `m@j.co.za` | bay-operator | no inventory |

The seed contains **no stores user and no device user** — creating them is part of the plan:

- [ ] **SETUP-01 — Create the stores person.** As Admin, create user "QA Stores" with the
  `stores` role. Expect: user created; they can sign in with the password set.
- [ ] **SETUP-02 — Create the device.** As Admin, create user "Stores Tablet" with the
  **Device** checkbox ticked and the `stores` role. Expect: on the Users screen the account
  shows a tablet icon and a `Device` badge.
- [ ] **SETUP-03 — Print a stores badge.** On the Users screen, use **Print stores badge** for
  "QA Stores". Expect: a Code 128 barcode PDF encoding `badge:<userId>`; printable.
- [ ] **SETUP-04 — No badge for a device.** Expect: the "Stores Tablet" user offers **no**
  badge print — a device never has a Badge Card.
- [ ] **SETUP-05 — Sign the tablet in.** Sign in to the mobile app as "Stores Tablet". Expect:
  only the tabs the stores role can reach appear, including **Stores**.

---

## 1 · Parts catalog (PART)

Web `/parts`, permission `part:read` / `part:update`.

- [ ] **PART-01 — Create a piece-counted Part.** New part with a Supplier, Unit `piece`,
  Stock tracking **perpetual**, Minimum stock 5, Storage location, Category. Expect: appears in
  the Parts table and on `/inventory`.
- [ ] **PART-02 — Create a linear Part.** Unit `mm`, Standard purchase length e.g. 6000.
  Expect: saved; the standard purchase length is required and must be positive for `mm` parts.
- [ ] **PART-03 — Linear without purchase length refused.** Try to save a `mm` Part with no or
  zero Standard purchase length. Expect: validation error.
- [ ] **PART-04 — Unit classes.** Create Parts with units from each class — `set`/`box`/`pair`,
  `kg`/`litre`. Expect: all accepted; quantities later post as numeric deltas.
- [ ] **PART-05 — Supplier XOR built status.** Try to create a bought Part without a Supplier,
  then a Part that is both internally fabricated and has a Supplier. Expect: both refused. An
  internally fabricated Part may have an empty BOM: that is the legitimate trivial build whose
  components are all raw material.
- [ ] **PART-06 — Built Part.** Create a Part, open **Edit → Bill of Materials**, add component
  rows (include one linear component), save. Expect: BOM saved; the Part now counts as a Built
  Part; its Supplier field is gone/cleared.
- [ ] **PART-07 — Built Part never linear.** Try to give a Part with a BOM the unit `mm`.
  Expect: refused.
- [ ] **PART-08 — Nested BOM allowed.** Add the PART-06 Built Part as a component of a second
  Built Part. Expect: accepted (BOMs nest; builds won't recurse — verified in BLD-06).
- [ ] **PART-09 — Periodic Part.** Create a raw-material style Part with Stock tracking
  **periodic**. Expect: saved; consumption restrictions verified in STK-13/14.
- [ ] **PART-10 — Bulk import.** Use **Bulk import parts** with a small CSV including one
  invalid line. Expect: per-line preview shows the failure; valid display fields use the importer's
  intentional title-case normalization while known technical tokens stay uppercase; invalid line
  is reported, not silently dropped.
- [ ] **PART-11 — Edit before any PO.** Change a Part's Unit and Supplier before it appears on
  any PO. Expect: allowed.
- [ ] **PART-12 — UoM/Supplier freeze.** After the Part sits on a non-cancelled PO (do after
  PO-03): try to change its Unit or Supplier. Expect: refused/locked — both freeze once the
  Part appears on a non-cancelled PO.
- [ ] **PART-13 — Storage location is findability only.** Change a Part's storage location.
  Expect: no stock movement is created; history unchanged.

## 2 · Barcode labels (LBL)

- [ ] **LBL-01 — Single label.** From a Part's edit dialog, **Print part label**. Expect: label
  PDF with the Part's barcode; scanning it later on the tablet resolves the Part (TAB-04).
- [ ] **LBL-02 — Batch by category/location.** **Print Part labels** from the Parts page —
  batch by Category, then by Storage location, then by explicit selection. Expect: each mode
  produces the right set at `/api/parts/labels`.
- [ ] **LBL-03 — Label permission.** As Sales, request a label URL directly. Expect: refused.

## 3 · Stock on hand & movements — web (STK)

Web `/inventory`. Toolbar buttons are derived per Part — a button whose action the Part can't
take is disabled, and the server refuses the same write (same derivation on both seams).

- [ ] **STK-01 — Opening balance.** As Admin, **Post adjustment**: PART-01, +20, reason
  *opening balance*, unit cost set, **no note**. Expect: posts without a note (opening balance
  is the one reason excused); stock on hand 20; cost established.
- [ ] **STK-02 — Note required for other reasons.** Post an adjustment with reason *damage* (or
  any non-opening reason) and an empty note. Expect: refused — note is mandatory for every
  reason except opening balance.
- [ ] **STK-03 — Linear opening balance.** Opening balance for the linear Part: quantity in
  pieces, Length (mm) bucket = standard purchase length, opening cost per length piece. Expect:
  on-hand shows bucketed lengths; cost stored per-mm.
- [ ] **STK-04 — Checkout to a Job.** **Check out** PART-01 ×5 against a live Job. Expect:
  movement posts at current moving average; on hand 15; the Job's Stock tab shows the draw.
- [ ] **STK-05 — Return to store.** Return 2 of those from the same Job. Expect: returns at the
  cost that Job drew; on hand 17.
- [ ] **STK-06 — Warnings never block.** Check out more than free stock (e.g. ×50). Expect: a
  warning before posting ("preview") and on the post — with an explicit way to post anyway;
  stock goes negative; nothing blocks.
- [ ] **STK-07 — History drill-down.** Open `/inventory/<part>`. Expect: append-only movement
  list — every STK row so far, newest data consistent with on-hand; no edit or delete
  affordance anywhere.
- [ ] **STK-08 — Adjustment down.** Post −3 with reason + note. Expect: on hand drops; history
  row records the reason and note.
- [ ] **STK-09 — Length bucket on checkout.** Check out the linear Part, keying the piece's
  **Length (mm)** (the standard purchase length is shown as guidance). Expect: the draw lands in
  that exact bucket; drawing a bucket short warns but still posts.
- [ ] **STK-10 — Revalue.** As Admin (or Procurement), **Revalue Part** with a new unit cost
  and note. Expect: revaluation row in history; moving average changes; on-hand quantity
  untouched.
- [ ] **STK-11 — Disabled actions.** Select the Built Part (PART-06) on `/inventory`. Expect:
  no purchase-shaped action offered; **Build stock** enabled. Select a supplier Part: **Build
  stock** disabled.
- [ ] **STK-12 — Server enforces build eligibility.** Attempt (via a crafted call or by racing
  the UI) a build on a bought Part. Expect: refused. A Built Part with an empty BOM remains
  buildable as a legitimate trivial build.
- [ ] **STK-13 — Periodic Part rejects consumption.** Try to **Check out** the periodic Part
  (PART-09). Expect: refused/not offered — periodic Parts reject consumption movements.
- [ ] **STK-14 — Periodic Part accepts the allowed three.** For PART-09: opening balance
  adjustment ✓, receipt against a PO line ✓ (after RCV-01), stocktake count ✓ (ST suite).
  Any other adjustment reason: refused. Return to Supplier: allowed — the one
  consumption-shaped movement a periodic Part accepts.
- [ ] **STK-15 — "No cost yet", never zero.** Create a fresh Part, post an opening balance
  with no cost. Expect: cost shows as absent ("no cost yet"), not `0.00`, until a cost-bearing
  movement establishes it.

## 4 · Costing & the cost gate (COST)

- [ ] **COST-01 — Moving average math.** On a fresh Part: receive 10 @ 100, then 10 @ 200
  (via POs, after suite 5). Expect: moving average 150; a checkout then draws at 150.
- [ ] **COST-02 — Per-mm for linear.** Verify the linear Part's cost displays per length
  piece / per mm consistently across `/inventory`, history, and variance.
- [ ] **COST-03 — Internally fabricated.** Mark a Part internally fabricated. Expect: zero
  material cost carried.
- [ ] **COST-04 — Cost gate nulls everything.** Sign in as "QA Stores" (no
  `inventory_cost:read`). Sweep: `/inventory` (no cost/value columns), part history (no costs),
  stocktake session (no Value column), PO detail (no line prices, no PDF download), Job cost
  comparison (absent). Expect: every cost field reads as empty/absent on every surface — one
  gate, no leaks.
- [ ] **COST-05 — Revalue gate.** As "QA Stores" try to reach the Revalue action; as
  Procurement, revalue succeeds. Expect: stores blocked, procurement allowed
  (`inventory_cost:revalue`).

## 5 · Purchase Orders — draft to sent (PO)

Web `/purchase-orders`.

- [ ] **PO-01 — Create a draft.** As Procurement, create a PO for PART-01's Supplier. Expect:
  Draft status; editable aggregate — expected date, lines, optional linked Jobs.
- [ ] **PO-02 — Supplier-scoped lines.** Try to add a line for a Part belonging to a different
  Supplier, and for the Built Part. Expect: both impossible — every line's Part must belong to
  the order's Supplier, and a Built Part never sits on a PO line.
- [ ] **PO-03 — Draft editing needs cost read.** As "QA Stores", open the draft. Expect: cannot
  edit it (line prices are stored facts; editing a draft needs `inventory_cost:read`).
- [ ] **PO-04 — Cancel only with no history.** Create a throwaway draft, **Cancel** (confirm
  dialog). Expect: cancelled. After a PO has received anything (RCV-01), Cancel is gone.
- [ ] **PO-05 — Mark sent freezes.** **Mark sent** on PO-01's order. Expect: editing controls
  disappear; status Sent; an immutable PDF is saved on the PO (order number + linked Job codes
  in it).
- [ ] **PO-06 — PDF projection.** Link the PO to a Job before sending (or use a linked one).
  Expect: the PDF appears in that Job's Documents tab, visible **only** to cost readers —
  confirm "QA Stores" cannot see it there.
- [ ] **PO-07 — PDF access.** Draft **Preview PDF** requires Purchase Order create access and
  cost read because the preview prints prices. Stored PDF **Download** is offered to cost readers
  only.
- [ ] **PO-08 — On Order appears.** After PO-05, check `/inventory` and the buy list. Expect:
  ordered −not-yet-received quantity shows as **On order**, beside Free Stock, never folded
  into it.

## 6 · Receiving, amendments & returns to supplier (RCV)

- [ ] **RCV-01 — Receive against a line.** On the sent PO, **Receive delivery** on a line.
  Expect: quantity/cost default from the line price; for the linear Part, length defaults from
  standard purchase length; stock on hand rises immediately — receiving *is* the ledger write.
- [ ] **RCV-02 — Partial receive.** Receive less than the line quantity. Expect: status shows
  **Partially received** (computed, not set by hand); remainder still owed and still On Order.
- [ ] **RCV-03 — Label from receipt.** A received row offers a Part-label print. Expect: label
  prints for the received Part.
- [ ] **RCV-04 — Amend: change quantity.** On the sent PO, amend a line's quantity **with a
  note**. Expect: amendment recorded in the Amendment history card; a new PDF revision is
  generated.
- [ ] **RCV-05 — Amendment note mandatory.** Try any amendment with an empty note. Expect:
  refused.
- [ ] **RCV-06 — Quantity floor.** Try to amend a line's quantity below what it has already
  received. Expect: refused.
- [ ] **RCV-07 — Other amendment kinds.** Exercise **Add a line**, **Change expected
  delivery**, **Substitute a Part** (substitute must still belong to the Supplier). Expect:
  each records history + note + new PDF revision. These four are the only kinds offered.
- [ ] **RCV-08 — No amendments on drafts.** Open a Draft PO. Expect: no amendment controls.
- [ ] **RCV-09 — Return to supplier, wrong-item.** From the tablet or web, return received
  stock with reason *wrong-item*. Expect: posts at the line's stamped receipt cost; the line
  **re-opens** (owed quantity and On Order rise again); the return appears in the Returns card
  with an **Awaiting credit** badge.
- [ ] **RCV-10 — Return, order-error.** Return with reason *order-error*. Expect: same cost
  stamping, but the line does **not** re-open.
- [ ] **RCV-11 — Close short.** On a partially received PO, **Close short** (confirm dialog).
  Expect: allowed only because it has receipt history and a remainder; owed quantities zero
  out; On Order drops; nothing further can be received.
- [ ] **RCV-12 — Close short prerequisites.** Try Close short on a sent PO with no receipts.
  Expect: not offered/refused.
- [ ] **RCV-13 — Return after close-short.** Return earlier-received stock on the closed-short
  PO. Expect: still allowed.
- [ ] **RCV-14 — Credit note.** **Record a credit note** and settle the RCV-09 return. Expect:
  the Awaiting-credit badge clears for that return (keyed per movement); the credit note stays
  on the PO — it is never projected onto Jobs.
- [ ] **RCV-15 — Return permission alternatives.** As "QA Stores" (has `inventory:move`, lacks
  `purchase_order:amend`) post a web Return to Supplier. Expect: allowed. Procurement can post the
  same PO-bound flow under `purchase_order:amend` without gaining general Checkout rights.
- [ ] **RCV-16 — PO audit trail.** Check `/audit`. Expect: the PO lifecycle above left audit
  entries.

## 7 · Supplier invoice & AI cross-check (INV)

- [ ] **INV-01 — File an invoice.** On a received PO, **File a Supplier invoice** (upload a
  PDF/scan whose prices differ slightly from the PO). Expect: document stored on the PO.
- [ ] **INV-02 — Cross-check flags.** Expect: the cross-check card shows advisory flags
  (recomputed on read) where invoice disagrees with PO/receipts, each with **Apply** /
  **Dismiss**.
- [ ] **INV-03 — Apply a price flag.** On a flagged Part whose received stock is **undrawn**,
  **Apply**. Expect: a Revaluation posts; the Part's cost updates; flag resolved.
- [ ] **INV-04 — Apply refused once drawn.** Flag a Part whose received stock has since been
  checked out. Expect: Apply is refused — revaluation-via-invoice is only for undrawn stock.
- [ ] **INV-05 — Dismiss is permanent.** Dismiss a flag, reload. Expect: it stays dismissed;
  one flag takes one answer.
- [ ] **INV-06 — Price variance report.** Open `/inventory/price-variance` as Procurement.
  Expect: PO-vs-invoiced comparison rows. As "QA Stores": the page is inaccessible
  (`inventory_cost:read`).

## 8 · Suppliers (SUP)

- [ ] **SUP-01 — Create & edit.** Create a Supplier; edit its details. Expect: both work
  under `supplier:update`; audit entries at `/audit`.
- [ ] **SUP-02 — Removal blocked by draft PO.** Give the Supplier a draft PO, try to remove
  the Supplier. Expect: refused while a draft PO exists.
- [ ] **SUP-03 — Removal gate.** As Procurement (no `supplier:remove`), try to remove any
  Supplier. Expect: refused; as Admin on a Supplier with no draft POs it succeeds.

## 9 · Buy list & on-order (BUY)

Web `/inventory/buy-list`.

- [ ] **BUY-01 — Three reasons, tagged.** Engineer each trigger: (a) Free Stock negative
  (commit a Job beyond stock), (b) on hand below Minimum Stock, (c) on hand ≤ 0. Expect: each
  Part appears once with the right **Why** tags; nothing else appears.
- [ ] **BUY-02 — Ranking.** Parts wanted by Jobs rank by earliest unfinished Work Slot date
  ("Needed by"); Parts nobody is waiting on sort last.
- [ ] **BUY-03 — Suggested buy.** Verify: suggested = largest shortfall minus On Order,
  floored at zero. A Part fully covered by an open PO shows suggested 0.
- [ ] **BUY-04 — Built Part never ticked.** Drive a Built Part onto the buy list (negative
  free stock). Expect: it appears but cannot be ticked for purchasing.
- [ ] **BUY-05 — Create draft POs.** Tick several Parts across two Suppliers, adjust a
  quantity, **Create Purchase Orders**. Expect: one **Draft** per Supplier at the chosen
  quantities; each costed Part starts at its current moving average, while a never-costed Part
  renders a blank **Not priced** field and makes the draft total say **Not priced**, never
  `R 0.00`; ticking never sends anything.
- [ ] **BUY-06 — Late POs table.** Set a sent PO's expected date in the past (amendment) with
  lines still owed. Expect: it appears in **Late Purchase Orders** (Order / Supplier /
  Expected / Overdue / Still owed). A closed-short PO does not.
- [ ] **BUY-07 — Load more.** With enough rows, the list paginates with **Load more** and no
  duplicates.

## 10 · Jobs — checkout, commitment, close-out (JOB)

- [ ] **JOB-01 — Job Stock tab.** Open a live Job's sheet as Admin. Expect: **Stock** and
  **Variance** tabs (hidden from users without `inventory:read`); Stock tab lists CFO demand,
  drawn, committed; offers Check out / Return to store / Create Purchase Orders from unmet
  demand.
- [ ] **JOB-02 — Commitment math.** For a Job whose CFO wants 10 of a Part: draw 4. Expect:
  committed shows 6 (`max(0, CFO − drawn)`); Free Stock on `/inventory` = on hand − open
  commitments.
- [ ] **JOB-03 — Over-draw clamps commitment.** Draw 12 of the 10. Expect: committed 0, never
  negative.
- [ ] **JOB-04 — POs from the Job.** Use the Stock tab's Create Purchase Orders on unmet
  demand. Expect: draft POs per Supplier, linked to the Job.
- [ ] **JOB-05 — Close-out queue.** Complete a Job still holding drawn stock or open
  commitment. Expect: it appears at `/inventory/close-out`, oldest first, with waiting days;
  columns Job / Completed / Waiting / Parts drawn / Parts committed.
- [ ] **JOB-06 — Cancelled Jobs excluded.** Cancel a Job that had drawn stock. Expect: never
  in the queue; its Parts can still be returned to store at the cost the Job drew.
- [ ] **JOB-07 — Close out.** On the queue detail page: return a leftover Part, then **Close
  out**. Expect: remaining commitment released permanently; Job leaves the queue; Free Stock
  rises.
- [ ] **JOB-08 — Close-out is once, no reopen.** Revisit the closed-out Job. Expect: no
  close-out affordance again, no reopen anywhere; it is a recorded event, not a status.
- [ ] **JOB-09 — Close-out permission.** "QA Stores" can work the queue (`inventory:close-out`
  in the stores role); Procurement cannot see `/inventory/close-out`.

## 11 · Job material variance (VAR)

- [ ] **VAR-01 — Report shape.** Open `/inventory/job-variance/<job>` for JOB-02's Job.
  Expect: per-Part rows of CFO quantity vs drawn (net of returns) at stamped cost; length
  buckets summed away.
- [ ] **VAR-02 — Off-CFO rows.** Draw a Part the CFO never asked for. Expect: it reports as
  its own row.
- [ ] **VAR-03 — Never re-priced.** Revalue a drawn Part, reload the report. Expect: variance
  still shows the stamped draw cost, not the new average.
- [ ] **VAR-04 — Same report at every stage.** Check the report on a live, a completed, and a
  closed-out Job. Expect: reads identically at all three.
- [ ] **VAR-05 — Cost comparison gate.** The Job cost comparison summary shows for Admin/
  Procurement, is absent for "QA Stores" (`inventory_cost:read`).

## 12 · Built Parts & builds (BLD)

- [ ] **BLD-01 — Build from stock.** **Build stock** for PART-06 ×2. Expect: consumption rows
  prefill at BOM × 2, editable; posting consumes components and adds 2 built units in one
  transaction. A linear component's BOM quantity is a count of whole pieces; its `mm` value names
  the length bucket and is not the BOM quantity.
- [ ] **BLD-02 — Value preserving.** Expect: output cost per unit = total consumed value ÷
  units built; components' value left stock, the same value arrived on the Built Part.
- [ ] **BLD-03 — Deviation warns.** Edit a consumption row away from BOM × N. Expect: warning,
  posting still allowed.
- [ ] **BLD-04 — Short rack goes negative.** Build with insufficient component stock. Expect:
  warned, allowed, component goes negative.
- [ ] **BLD-05 — No cost in, no cost out.** Build from components that have no established
  cost. Expect: output carries no cost (not zero).
- [ ] **BLD-06 — Builds never recurse.** Build the nested Built Part (PART-08). Expect: it
  consumes the *first-level* components only — PART-06 units come from stock, never built
  implicitly.
- [ ] **BLD-07 — Build permission.** "QA Stores" can build (`inventory:build`); Procurement
  cannot.
- [ ] **BLD-08 — Stock Build Job.** Create a stock build via `/jobs/stock-build` from a Build
  Spec. Expect: spec selector seeds the Job; resulting Job behaves like other Jobs in the
  stock surfaces.

## 13 · Stocktake (ST)

Sessions are opened, counted, and closed **on the tablet**; the web pages are read/report
only. Scopes: **raw material** (weekly cadence) and **stores** (monthly).

- [ ] **ST-01 — Open a session.** On the tablet, start a raw-material session. Expect:
  session opens; the web `/inventory/stocktake` lists it as open.
- [ ] **ST-02 — One open session per scope.** Try to start a second raw-material session.
  Expect: refused/only "resume" offered. A stores session can still be opened in parallel.
- [ ] **ST-03 — Blind entry.** Count a Part: the expected figure is hidden until a count is
  keyed, then shown for a one-tap recount before posting. Expect: exactly that flow.
- [ ] **ST-04 — Count posts a delta.** Count 18 against an expected 20. Expect: a
  `stock-count` movement of −2 (computed against on-hand at the moment of the count, not an
  overwrite); no note demanded (session-stamped counts are excused).
- [ ] **ST-05 — Agreeing count still posts.** Count exactly the expected figure. Expect: a
  zero-delta row still lands in history.
- [ ] **ST-06 — Second count corrects.** Count the same Part again with a different figure.
  Expect: legal; the second count corrects against the first.
- [ ] **ST-07 — Every bucket must be named.** For a linear Part holding stock in two length
  buckets, submit a count naming only one. Expect: refused — an unnamed bucket is never
  inferred empty.
- [ ] **ST-08 — Membership derived at count time.** Flip a Part's tracking mode
  (perpetual ↔ periodic) while a session is open. Expect: scope membership follows the mode at
  count time — nothing stored per-session.
- [ ] **ST-09 — Close with skip list.** Close the session leaving Parts uncounted. Expect: the
  close dialog previews the skip list; closing succeeds — there is no approval gate.
- [ ] **ST-10 — Web session report.** Open the session on the web. Expect: Counted table
  (Part, Expected → counted, Variance — Value only for cost readers) and the skip list. From the
  second closed raw-material session onward, cost readers also see **Raw material drift**
  (expected floor / actual depletion / drift) against the previous closed session.
- [ ] **ST-11 — Overdue signals.** With no closed raw-material session inside a week + 2
  working days (or a scope never counted at all). Expect: overdue indicator on the web
  sessions page, the tablet scopes screen, and the nav badge.
- [ ] **ST-12 — Count permission.** Counting requires `inventory:count` — "QA Stores" counts;
  Procurement cannot post counts (web offers no counting anyway).

## 14 · Stores tablet — device, actor, scans (TAB)

Signed in as the "Stores Tablet" device (SETUP-05).

- [ ] **TAB-01 — No actor, no post.** Fresh tablet: open a Part and try to post any movement.
  Expect: post button disabled with a "name yourself" notice — a device session must name an
  actor before any movement.
- [ ] **TAB-02 — Server enforces it too.** If a post can be forced without an actor (e.g.
  stale state), the server refuses. Expect: refusal, not success.
- [ ] **TAB-03 — Quick-switch by tap and by badge.** Open Quick-switch: pick "QA Stores" by
  name; then reset and scan their badge (SETUP-03). Expect: both name the actor; the header
  shows who is acting; reachable from every stores screen.
- [ ] **TAB-04 — Scan resolution order.** In the scan field, scan a badge, then a Part label.
  Expect: badge resolves before Part code; Part scan lands on the Part screen.
- [ ] **TAB-05 — Devices never appear as actors.** Expect: "Stores Tablet" is absent from the
  Quick-switch list; a crafted attempt to name a device (or a disabled/unknown user) as actor
  is refused.
- [ ] **TAB-06 — Quick-switch grants nothing.** With an actor named, verify the tablet still
  shows no prices anywhere (the device's stores role gates; the person only attributes).
- [ ] **TAB-07 — Idle timeout.** Leave the tablet idle past the timeout. Expect: the actor
  clears; next post requires naming again; nothing persisted across app restarts.
- [ ] **TAB-08 — Attribution lands.** Post a checkout as actor "QA Stores". Expect: the web
  history row attributes the movement to QA Stores, not to the device.
- [ ] **TAB-09 — Part screen.** Expect: stock figures with **no prices**, and exactly the
  four actions the Part supports (checkout / return to store / receive / return to supplier),
  disabled per derived Part Stock Actions.
- [ ] **TAB-10 — Receive on the tablet.** Receive against an open PO line. Expect: PO line
  picker, quantity, length bucket — **no price is ever keyed**; cost comes from the line.
- [ ] **TAB-11 — Return to supplier on the tablet.** PO line picker + reason. Expect: posts as
  in RCV-09/10.
- [ ] **TAB-12 — Warnings on the tablet.** Over-draw a Part. Expect: the movement warning
  modal appears with post-anyway, matching the web contract.
- [ ] **TAB-13 — Close-out on the tablet.** Work the close-out queue: return leftovers, note,
  close. Expect: parity with JOB-07.
- [ ] **TAB-14 — Tab gating.** Sign the mobile app in as Sales. Expect: no Stores tab at all.

## 15 · Product costing & estimation (EST)

- [ ] **EST-01 — Costing tab.** On `/products/<id>/edit` open **Costing**: edit raw materials
  per unit and labor per unit. Expect: saves; live cost estimate panel updates.
- [ ] **EST-02 — Estimate is a floor.** Remove the cost from one referenced Part. Expect: the
  estimate labels itself as a `≥` floor while any material/labor/bought-Part cost is missing.
- [ ] **EST-03 — Optional Assembly partial.** A Product with an Optional Assembly: its cost
  contribution is always labelled partial.
- [ ] **EST-04 — Estimate panel gate.** The live estimate panel requires `inventory_cost:read`
  — absent for "QA Stores".
- [ ] **EST-05 — Rate card seeds only.** On a Quote, add a Work Item: the Department seeds its
  rate from the rate card, the row snapshots it, and editing the card later never changes
  existing rows; a Department without a rate seeds at zero.
- [ ] **EST-06 — Snapshot freezes at Job creation.** Create a Job from a Quote, then change
  the Quote/Product materials. Expect: the Job's estimate snapshot (and its variance baseline)
  doesn't move.
- [ ] **EST-07 — Raw material drift.** With two closed raw-material stocktakes and Jobs in
  between: the drift table compares actual depletion against the frozen material lines of
  Jobs worked in the window.

## 16 · Permissions & navigation matrix (PERM)

For each persona, walk the nav and verify the corresponding API access:

| Surface | Admin | Procurement | QA Stores | Sales |
|---|---|---|---|---|
| /inventory (+ history) | ✓ | ✓ | ✓ | ✗ |
| Check out / return (move) | ✓ | ✗ | ✓ | ✗ |
| Adjust | ✓ | ✓ | ✓ | ✗ |
| Build | ✓ | ✗ | ✓ | ✗ |
| Revalue | ✓ | ✓ | ✗ | ✗ |
| /inventory/buy-list | ✓ | ✓ | ✓ | ✗ |
| /inventory/price-variance | ✓ | ✓ | ✗ | ✗ |
| /inventory/stocktake | ✓ | ✓ | ✓ | ✗ |
| Post counts (tablet) | ✓ | ✗ | ✓ | ✗ |
| /inventory/close-out | ✓ | ✗ | ✓ | ✗ |
| /purchase-orders | ✓ | ✓ | ✓ (read + receive, no prices) | ✗ |
| PO create/send/amend/close | ✓ | ✓ | ✗ | ✗ |
| /suppliers | ✓ | ✓ (no remove) | ✗ | ✗ |
| /parts | ✓ | ✓ | per role | ✗ |
| Cost fields anywhere | ✓ | ✓ | **all null** | — |

- [ ] **PERM-01 — Nav hides denied surfaces.** Every ✗ above is absent from the nav. A manually
  entered client route may render an empty shell; API authorization remains the security boundary.
- [ ] **PERM-02 — API refuses.** Spot-check two ✗ cells at the API level (e.g. Sales calling
  stock-on-hand; Procurement posting a checkout). Expect: authorization errors.
- [ ] **PERM-03 — Nav shape.** The Inventory nav group renders only the entries each persona
  can open.

## 17 · Nav signals (SIG)

- [ ] **SIG-04 — Nav badges.** Nav indicators for stocktake-overdue and returns-awaiting-
  credit light up under ST-11 and RCV-09, and clear when resolved.

## 18 · Docs & help links (HELP)

- [ ] **HELP-01 — Every inventory page's Help resolves.** On each page in suite tables above,
  the Help link opens the matching docs page (stock on hand → Free Stock concept page;
  buy list → raise-POs guide; stocktake → run-a-session; close-out; price variance →
  cross-check guide; parts → print-labels; purchase orders → post-a-receipt; products →
  cost-estimate guide; suppliers → maintain-suppliers; tablet home → work-the-stores-tablet).
  Expect: no 404s, topic matches the screen.
- [ ] **HELP-02 — Docs match behavior.** Skim each inventory task page while executing its
  suite; flag any step the shipped UI contradicts.

---

## Known-sharp edges worth extra attention

1. **Warnings vs refusals.** The system's contract is precise: quantity disagreements *warn*
   (always postable); structural violations *refuse* (periodic consumption, unnamed stocktake
   buckets, supplier-mismatched PO lines, amendment below received, device-as-actor). Any case
   where a warning blocks or a refusal merely warns is a bug.
2. **The cost gate.** One missing null-out (a tooltip, an export, a PDF, a variance cell)
   breaks the stores role's price-blindness. Sweep with dev tools open — check API responses,
   not just the rendered page.
3. **Derived actions.** Buttons and server gates share one derivation — a disabled button
   whose action the server would accept (or vice versa) is a seam failure.
4. **Concurrency.** Two tablets posting against the same Part; a count posted while a checkout
   lands; receiving while an amendment saves. The post re-judges under lock — final state must
   be consistent (append-only ledger, no lost updates).
