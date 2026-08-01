# Inventory Management v1 — Specification

Assembled 2026-07-28 from the decisions on wayfinder map [#881](https://github.com/Jedidiah-Equipment/jedidiah-platform/issues/881) (closing records: #882, #883, #884, #885, #886, #887, #888, #951, #953, #954, #989). This document is the agreed shape of v1; the closing comments on those issues hold the full reasoning and rejected alternatives.

**Purpose.** Management-grade inventory: the right stock in the warehouse at the right time, honest visibility of what's committed and what's free, and cost data good enough to spot outliers. The accountant runs the books from quotes and invoices; this system never feeds them.

**Built, not bought** (#882): inventory is a platform subsystem. The parts-identity constraint (Jobs, CFO, and BOM all FK into `parts`) settled it, and the #951 re-check confirmed it — the feared MRP scope collapsed into one BOM table and two movement types.

---

## 1. Vocabulary

New domain terms (CONTEXT.md gains these at implementation):

- **Stock Movement** — one append-only ledger row changing an item's stock or cost. Never edited, never deleted.
- **Stock Tracking Mode** — per-item: `perpetual` (every movement recorded; SOH = ledger sum) or `periodic` (receipts and stocktake counts only; no consumption movements).
- **Built Part** — a Part carrying a Bill of Materials instead of a Supplier; stocked, checked out, and costed like any Part; produced by a Build.
- **Build** — the production event that consumes a Built Part's BOM components from stock and produces units of the Built Part, value-preserving.
- **Commitment** — derived, never stored: `max(0, CFO quantity − checked out)` per part per Job.
- **Close-out** — the inventory-local action ending a Job's stock life: return leftovers, release remaining commitment. Not a Job status.
- **Stocktake Session** — a first-class counting session: opened with a scope, counted item-by-item, closed; the close surfaces skipped items.
- **Purchase Order** — now the live entity (supplier, lines, states). The historical `purchase_order` Job documents were hand-made ancestors of exactly this; CONTEXT.md's entry is rewritten.

"Part" widens from "the reusable purchasable item layer" to **"stockable catalog item, bought or built"**. "Assembly" stays Product-owned (Standard/Optional, quote-facing) — a standalone assembly is a Built Part, not an Assembly.

## 2. The ledger

One append-only movement ledger for all stocked items (#883). SOH is `SUM(delta)`, grouped by part — and by `lengthMm` for linear material. Movement vocabulary, complete:

| Movement | Sign | Cost handling |
|---|---|---|
| `receipt` | + | unit cost defaults from the PO line; confirmed or corrected desk-side by a cost-gated user during invoice reconciliation; updates the moving average |
| `checkout` | − | stamped with the current moving average at draw time |
| `return-to-store` | + | reverses at the cost the parts left with |
| `return-to-supplier` | − | at the original receipt's stamped cost; reason enum; PO-line-linked |
| `adjustment` | ± | reason enum (`opening-balance`, `stock-count`, `damage`, `scrap`, `correction`); note mandatory except opening balance; `opening-balance` may carry `unitCost` to seed value |
| `revaluation` | 0 | zero-quantity cost-only row; sets the moving average |
| `build-consume` / `build-produce` | −/+ | value-preserving pair: consumed at stamped averages; produced at consumed value ÷ N |

Every movement carries `actor_user_id` — a deliberate departure from the platform's no-attribution convention: on an append-only ledger, the actor is part of the fact.

**Units of measure** (product feedback, 2026-08-01). `unitOfMeasure` widens from `{quantity, mm}` to three classes: **discrete** — `piece` (migrated from `quantity`), `set`, `box`, `pair`; **linear** — `mm`; **measured** — `kg`, `litre`. The class decides the math: discrete and linear quantities are integers; measured quantities are decimals — so the ledger's `delta` is `numeric`, with integer validation enforced per class (the ledger's deliberate exception to the integer-quantity convention widens by one step). Metres are **display formatting of `mm`**, never a second unit (a 13M channel is `standardPurchaseLength: 13000`, shown as "13 m"). **A part's UoM is its counting unit everywhere** — stock, PO lines, BOMs, checkout: if boxes get opened and pieces drawn, the part is `piece` and the PO orders pieces; pack sizes never become a second unit on the same part.

**Two tracking modes, one storage model.** Perpetual items (parts, Built Parts) use the full vocabulary. Periodic items (raw material) post receipts and `stock-count` adjustments only — no consumption movements at all (Jed's decision). Between counts the periodic ledger only ever adds, so **periodic SOH is stale-high — an upper bound on the shelf**, corrected downward by the weekly stocktake; the SOH report labels it "as of last count" so nobody reads it as available stock. (The *costing* side is conservative separately: consumption estimates are deliberately high, §7.) Flipping an item's mode is a field change, not a migration.

**Linear material** (`unitOfMeasure = mm`): stock is a count of pieces bucketed by length. On **perpetual** linear items a cut is two movements in one transaction (`−1 @ 6000`, `+1 @ 5000`); on **periodic** raw material cuts are never posted — bucket changes surface at the next stocktake, whose count sheet captures per-length buckets (`13M × 9`, `4.2M × 1`). Standard purchase length becomes a real field on Part (killing the `category: "6000"` hack). Plate sizes live in part identity; offcuts are deliberately untracked (they belong to the nesting software).

**Location** is a free-text `storageLocation` attribute on Part (the `category` pattern) — findability only, never a ledger dimension. No per-location SOH, no transfers.

**Products are not stock items.** A built unit is a Job-lifecycle concern (#883; Product Unit extraction is #952/#1009, outside inventory v1).

## 3. Stock meets Jobs (#884)

- **Checkout is the only stored allocation-side fact**: `(job, part, lengthMm?, qty, actor, time)`, via barcode. Custom Jobs are valid targets (they have no CFO). The CFO is demand, **never a gate** — over-draw and off-BOM draws warn and post.
- **Commitment is derived**: **zero once the Job (or line) is closed out**, else `max(0, CFO − drawn)` per part per Job. Appears at Job creation, decays with draws, self-extinguishes — and the close-out predicate is what actually releases the remainder of a Job that never drew its full CFO. Closed-out stays zero regardless of later movements; reopening is not a v1 concept. No reservation table.
- **Free** = `SOH − Σ committed`. **On order** = `Σ(ordered − received)` over open sent PO lines — shown beside free wherever buying is decided, never folded into it. Suggested buy = shortfall − on order.
- **No hard stops anywhere.** Negative free → procurement's ranked buy list (by earliest Slot date). Negative SOH at scan → count-is-wrong flag. Job creation and Slot booking are never stock-gated.
- **Close-out**: stores returns a finished Job's leftovers and releases remaining commitment, one motion. Prompted by the **close-out queue**: Jobs whose **Job Completion (`completedOn`) is set** and which still have drawn stock not returned or commitment not closed, surfaced as a permission-gated dashboard widget. A Job leaves the queue only when actually closed. Backstop: stale-commitment report. *(This supersedes #884's Board-projection trigger, which predated the stored Job Completion feature — completion is latched and human-controllable, so a delayed Job whose `completedOn` was cleared is correctly not offered for close-out, and a manually completed Job appears immediately.)*
- **Returns re-open commitment** (drawn decreases) — correct for live Jobs; the close-out screen combines return-and-close.
- **Variance per Job**: drawn vs CFO, priced at stamped draw costs.

## 4. Purchasing (#885)

A PO is an order on **one Supplier** — never owned by or scoped to a single Job (there is no per-Job PO entity), though one may be *initiated from* a Job's demand. Born three ways: seeded from a Job (outstanding commitment with free-stock alongside; ticked parts auto-split into one draft PO per supplier), from the buy list, or from scratch.

- **Job links: plural, optional, document-routing.** The generated PO PDF auto-surfaces on linked Jobs' documents tabs; linked Job codes print on the PDF (suppliers echo them on invoices — AI matching hints). Links are never cost attribution — the checkout ledger owns Job cost.
- **Lifecycle**: `draft` (freely editable) → `sent` (human assertion in v1; procurement sends the PDF themselves) → `partially received` → `received` (computed from receipts, never toggled). Exits: `cancelled` (zero receipts), closed-short. Over-receipt warns.
- **Sent POs take logged amendments** — quantity change (either direction), add line, substitute part; who/when/note; PDF regenerable. The phone call that changes an order is the recorded event. No auto-generated supplementary POs.
- **Lines**: part, quantity (pieces; standard purchase length for linear), `unitPrice`. Header: optional expected delivery date.
- **Receiving** receives against open PO lines; refused-at-dock deliveries record nothing; damaged-later goes `return-to-supplier` (`defective`). Credit notes attach one-to-one against the original invoice.
- Raw material rides POs like everything else; its receipts post movements (the baseline the next stocktake corrects).

## 5. Costing & valuation (#887)

- **Moving weighted average, per part** — per mm for linear (a bucket's value is `length × avgPerMm × count`; cuts are value-neutral). FIFO rejected (cost layers serve books that live elsewhere; re-derivable from the ledger if ever needed).
- **A part's cost *is* its ledger cost.** Seeded by `opening-balance` with `unitCost`; updated by every receipt; adjustable via `revaluation`. No stored `costPrice` field. A never-costed part shows **"no cost yet"**, never R0.00. Price history = a query over receipts.
- **Draws are stamped**: checkout and return rows carry unit cost at draw time — Job costs and variance never drift retroactively.
- **Price capture, three levels, all v1**: the PO line carries the price → the receipt posts with that price by default (the dock confirms **quantities**; the stores role is price-blind by the cost gate, §11) → price confirmation and correction happen **desk-side by a cost-gated user** during invoice reconciliation: supplier invoice PDF attached to the PO, **AI invoice extraction advisory-only** (flags line mismatches; one-click apply is the human confirmation; the ledger is only ever written by a human).
- **Fabricated sheet-metal parts carry zero material cost** — their material is charged through the raw-material lines; costing them separately would pay for the plate twice.
- **Currency: ZAR only.** Rare foreign suppliers get a manual conversion at PO entry.

## 6. Built Parts (#951)

- A Built Part is a Part with BOM rows (`part_bom`: parent → component → quantity, cycle-checked). **Invariant: a Part has either a Supplier or a BOM — never both, never neither.** `parts.supplierId` goes nullable; the *Jedidiah Fabrication* fake supplier dies.
- Everything works unchanged because a Built Part is a part: code, catalog, labels, ledger, checkout, CFO representation, commitment, cost gate.
- **BOMs nest; builds never recurse.** One level, from stock: inner batches (brake cylinders) are built to the rack before outer builds (walking beam suspensions) consume them. Insufficient stock warns and goes negative.
- **Raw-material BOM lines are informational** (periodic items post no consumption) — so fabricated components are producible by trivial builds at zero cost.
- **The Build**: one transaction; consumption prefills at BOM × N, editable to what actually left the rack (deviation shown, never blocking); produce at consumed value ÷ N. Posted from the tablet under `inventory:build`.

## 7. Raw material & the Product's material list (#953)

- Raw material (plate, channel, tube, bar) is periodic: weekly stocktake is the only writer besides receipts. Between counts its SOH is **stale-high by design** (nothing records consumption — see §2); the weekly count is what pulls it back to reality, which is why stocktake is load-bearing, not optional.
- **The Product carries a per-material list**: each line a raw material + decimal consumption per unit, keyed manually from ProNest (2.5 plates of 3mm; 3 × 13M channel). Fields labeled *per unit* (the 36-vs-12 bulk-sheet error class). Full-plus-partial entry is UI sugar.
- **The estimate shows consumption, never posts it.** The list powers costing (#989) and an **expected-vs-actual drift report** beside the stocktake variance — the honest heir to auto-deduction.
- ProNest integration stays parked; the stocktake variance report is where "drift proves painful" becomes measurable.

## 8. Product cost estimation (#989)

```
estimate = Σ material lines × ledger cost
         + Σ BOM parts × ledger cost
         + Σ department hours × charge-out rate
```

The middle term covers **every part in the effective BOM at its ledger cost**: bought parts at their receipt-fed average; **Built Parts included at their ledger cost** (not exploded — their cost already carries their bought components and honestly excludes fabricated content, §6); fabricated non-BOM parts contribute zero by design (§5).

- **Department labor hours live on the Product** (Fabrication / Paint / Workshop), maintained under `product:update`. Not derived from `product_bays.defaultWorkingDays` — scheduling days are elapsed time, not labor.
- **The rate card is shared with quote work items** (#996: Fabrication 550 / Paint 375 / Workshop 320) — stored once, two consumers. Charge-out rates knowingly used in v1: the labor line is margin-neutral; the margin signal comes from materials.
- **Product-level roll-up** with a line breakdown (parts grouped by assembly; an Optional Assembly's bought-parts cost shows beside its upgrade price, labeled partial).
- **Live on the Product screen; snapshots onto the Job at creation** — estimated-vs-actual compares two stable numbers at close-out.
- **Incomplete estimates are loud**: "≥ R41,300 — missing: labor hours, 2 uncosted parts". Never a confident partial.

## 9. Stocktake (#954)

- **First-class session**: scope, open, count, close; the close lists skipped items. Adjustments gain the nullable session FK now.
- **Two rhythms**: raw material weekly in one sitting; stores monthly, rolling over days (the open session's uncounted list is the to-do).
- **Counts post `stock-count` delta adjustments** computed at count time (mid-session receipts don't corrupt earlier counts). Never overwrite.
- **Blind entry, informed review**: SOH hidden until the count is entered; variance shown immediately with one-tap recount. **No approval gate** — the control is the session variance report (deltas, skip list, priced total for cost-readers).
- **SOH hitting zero by any path** → out-of-stock list + procurement notification. Never an automatic PO.

## 10. Barcodes, hardware, surfaces (#886)

- **Identity: our own Code 128 labels of `parts.code`** + human-readable code/name/location. Bins for small parts; the item itself for large ones (axles, rims). Supplier barcodes are trusted for nothing; `supplierCode` stays free text. Linear labels are per part; length is asked at scan time.
- **Printing**: go-live batch, a button on receiving lines, a button on the part screen. No labeled/unlabeled tracking; type-ahead search is the universal fallback.
- **Scanner**: Bluetooth HID keyboard-wedge into an always-focused input; tablet camera fallback. Quantities keyed, not scan-repeated. Dock connectivity assumed (no offline subsystem).
- **Surfaces**: tablet app = physical flows (receive, checkout, both returns, builds, counts, close-out queue). Web = paperwork (PO drafting/amendments, invoice + AI panel, price reconciliation, reports).

## 11. Roles & access (#888)

- **New `stores` role** (`bay-operator` untouched — granting it anything would make every bay-operator account sign-in eligible).
- **The quick-switch: the device authorizes, the person attributes.** The tablet holds a normal session as a "Stores Tablet" user; the quick-switch (name tap / badge card) sets the required `actor_user_id`. No person → reads only. Idle timeout clears the actor. No PIN in v1 (deferred ratchet).
- **New resources**: `purchase_order` (read/create/send/amend/receive/close), `inventory` (read/move/adjust/count/build/close-out), `inventory_cost` (read/revalue).
- **The cost gate is one server-side projection rule**: without `inventory_cost:read`, cost fields are stripped from every surface — including PO lines on the tablet.
- **Matrix**: admin all; procurement-manager = PO surface + `inventory:read`,`adjust` + `inventory_cost` both; stores = `purchase_order:read`,`receive` + `inventory` read/move/adjust/count/build/close-out, no cost read; sales and job-viewer nothing.
- **Invariant**: `purchase_order:receive` implies posting receipt movements.

## 12. Reports, signals & the KPI dashboard

**Every part has a transaction history** — a drill-down from the SOH report showing the part's full movement ledger with running balance, actor, and cost-gated values: the answer to "why is this stock so low/high". Price history per part stays a query over receipts.

Beyond the flow-level reports, inventory ships **KPI dashboard widgets** on the platform's existing permission-gated widget registry, grouped by audience (product ask, 2026-08-01):

- **Stores**: close-out queue (§3) · negative-SOH flags · stale commitments · **parts below minimum** (a `minimumStock` field per part; below-minimum joins the zero-SOH signal) · **stocktake overdue** (no closed session covering a scope within its cadence plus grace).
- **Procurement**: buy list (negative free, ranked by earliest Slot date, on-order aware) · out-of-stock list · **late POs** (sent, past expected date, open lines) · **supplier returns awaiting credit** (`return-to-supplier` movements with no credit note attached to the PO) · PO-vs-invoiced price variance.
- **Management** (cost-gated): SOH valuation · **inventory turns** (perpetual items only — periodic raw material has no consumption events by design, and the tile says so) · **top adjustments and top scrap items** (adjustments grouped by reason, priced) · Job drawn-vs-planned variance · stocktake session variance · expected-vs-actual raw-material drift · estimated-vs-actual per Job.

## 13. Out of scope for v1

Accounting/GL integration (decided out — ledger preserves data to re-derive) · FX/multi-currency · finished-goods/product inventory (#952/#1009) · offcut tracking (nesting software's domain) · ProNest integration (parked; drift report is the trigger) · multi-supplier-per-part (would touch PO auto-split) · returns-to-supplier netting (suppliers credit one-to-one) · in-system PO emailing (tracked-as-sent in v1) · mandatory quick-switch PINs · offline tablet operation.

## 14. Go-live prerequisites (beyond code)

1. **Raw-material data migration** — catalog entries for channels, tubes, plates, bright bar, with standard purchase lengths; gates the first raw-material PO.
2. **Opening balances** — `opening-balance` adjustments with `unitCost` seed quantity and value in one motion.
3. **Hardware** — label printer + tablet-compatible Bluetooth scanner (both purchases).
4. **Labels** — the go-live batch; storemen badge cards from the same printer.
5. **Accounts** — the Stores Tablet device user + four storemen users; confirm no storeman is also a bay operator (single-role model).
6. **Product data** — per-material lists and department labor hours keyed for products that should estimate; minimum stock levels for parts that should alert.
