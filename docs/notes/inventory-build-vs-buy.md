# Inventory platform: build vs buy vs integrate

Resolves wayfinder #882. Research date: 2026-07-15. All product claims cite official vendor docs/pricing pages fetched on that date; prices change — re-verify before any purchase decision.

## TL;DR — Recommendation: BUILD

Build parts-inventory into the platform as a new subsystem (PO + receiving + stock-movement ledger + checkout-to-job), sized roughly like the existing jobs subsystem. Keep InvenTree as the fallback if scope balloons.

The three facts that drive it:

1. **The parts-identity constraint taxes every non-build option.** Jobs/CFO/BOM reference our `parts` table (`pkg/db/src/schema/part.ts`, `job_cfo_part` in `job.ts`). Every bought system introduces a second parts master and a bidirectional sync (codes, suppliers, new parts, deactivations) that we would have to build *anyway* — sync code plus a vendor integration is not obviously smaller than the inventory feature itself.
2. **v1 scope is one subsystem, not an ERP.** POs with three states, receive-against-PO, a movement ledger, checkout-to-job, adjustments, two reports. Calibrated against this repo: quotes = 148-line schema + 156-line router + ~3.6k web LOC; jobs = 321-line schema + 266-line router + ~3.7k web LOC. Inventory v1 lands in that band (see build assessment). The hard part — a ledger that supports FIFO/AVCO and period reports — is a well-understood append-only table design, not novel engineering.
3. **Every buy candidate has a real miss for this exact spec.** Katana has no FIFO (moving-average only); Unleashed is average-landed-cost only and starts at $399/mo for 3 users; Zoho has no "issue to job" concept and gates barcodes behind Premium; Cin7 Core starts at $349/mo with API access as a paid add-on; Odoo's barcode app is Enterprise-only and valuation drags in its Accounting app; ERPNext and InvenTree fit functionally but are a second self-hosted stack (Python/MariaDB, Python/Django) to operate, secure, and provision users in. At ~R18/USD, $299–$999/mo is R5,400–R18,000/mo for a small parts team — recurring, forever.

"Integrate" (their engine, our UI) is technically real for ERPNext, InvenTree, Odoo self-hosted, and (with caveats) the SaaS APIs — but it combines the costs of both options: we build most of the UI anyway *and* run/pay for a second system *and* own the sync. It only wins if inventory scope grows far beyond v1 (multi-warehouse, MRP, accounting integration).

## Comparison table

| Candidate | Receive-against-PO, partial | Barcode | Adjustments | Issue-to-job equivalent | FIFO / weighted avg | API: read+write parts/PO/receipts/stock | Webhooks | Hosting | Entry cost (USD/mo) | Deal-breakers |
|---|---|---|---|---|---|---|---|---|---|---|
| **Odoo Community** | Yes (backorders) | **No — Enterprise-only app** | Yes | Yes (MO consumption / analytic) | FIFO + AVCO, needs Accounting app | Yes — XML-RPC ORM, full CRUD, self-hosted = unrestricted | Via modules | Self-host free (LGPL) | $0 + ops | Barcode gap; valuation drags in accounting; Python/ORM stack |
| **Odoo Enterprise** | Yes | Yes (Barcode app) | Yes | Yes | FIFO + AVCO | Yes, but SaaS API only on Custom plan | Via Studio/modules | SaaS or on-prem | ~$25.50/user/mo (Custom) | Whole-ERP gravity; parts sync |
| **ERPNext** | Yes (Purchase Receipt, pending qty) | Yes (stock transactions) | Yes (Stock Entry/Reconciliation) | Material Issue + project dimension | FIFO + Moving Average | Yes — REST CRUD on every DocType, token auth | Yes (Frappe) | Self-host free (GPLv3) or Frappe Cloud from ~$5–40/mo | ~$0–40 + ops | Full-ERP surface; MariaDB/Python stack; parts sync |
| **Unleashed** | Yes (split receipt) | Via WMS/integrations | Yes (API resource) | Assemblies only — no job costing | **ALC (weighted avg) only, no FIFO** | Yes — REST, but no partial updates; 250k calls/mo on Core | Yes | SaaS only | **$399/mo (3 users)** + $69/extra user | Price; no FIFO; no job concept; parts sync |
| **Katana** | Yes ("receive some") | Not core (integrations) | Yes | MO completion consumes ingredients | **MAC only, no FIFO** | Yes — REST/OpenAPI, bearer key, 60 req/min | Yes (HMAC-signed) | SaaS only | Free tier; Core from $299/mo (usage-based) | No FIFO; finished-goods/MRP framing; parts sync |
| **Zoho Inventory** | Yes (Purchase Receives) | Barcode gen gated to Premium | Yes | **None — no manufacturing/job issue** | FIFO + WAC | Yes — REST, OAuth2, 2k–10k calls/day by plan | Not documented in API intro | SaaS only | R199–R1,499/mo (ZA pricing, 2 users base) | No issue-to-job; order-count limits; parts sync |
| **InvenTree** | Yes (per-line, partial, price carried to stock) | **Yes — first-class, incl. PO receiving + mobile app** | Yes | Build Orders allocate/consume stock | **Informal — per-stock-item cost + history, no FIFO/AVCO reports** | Yes — REST on everything, token auth, self-documented schema | Plugin system | Self-host free (MIT, Django/Postgres-capable) | $0 + ops | No formal valuation method; second Python stack; parts sync |
| **BUILD** | Design it | Expo app (camera) or USB wedge on web | Yes | Native — direct FK to `job_cfo_part` | Ledger supports either | It *is* our API | n/a | Already on Railway | $0 recurring | Engineering time; we own correctness of valuation math |

## Per-candidate notes

### Odoo (Community vs Enterprise)

- **Fit:** Purchase → Receipt flow validates received quantities against the PO; receiving less prompts backorder creation (must be enabled). Costing supports Standard, AVCO, and FIFO, but all three "require the Accounting app to be installed" with automatic accounting enabled — valuation drags in Odoo's accounting scope. Inventory adjustments and MO-based consumption exist.
  - Receipts: https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/receipts_delivery_one_step.html and partial-receipt/backorder flow per https://www.odoo.com/documentation/13.0/applications/inventory_and_mrp/purchase/purchases/rfq/reception.html
  - Valuation: https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/inventory/product_management/inventory_valuation/inventory_valuation_config.html
- **Barcode:** the Barcode app (receipts, adjustments, batch transfers via scanning) is **Enterprise-only** — on the official editions comparison it is checked under Enterprise, not Community. https://www.odoo.com/documentation/18.0/applications/inventory_and_mrp/barcode.html, https://www.odoo.com/page/editions
- **API:** XML-RPC external API with API keys; full ORM CRUD (read/write any model incl. POs, pickings, quants). On Odoo's SaaS, "Access to data via the external API is only available on Custom Odoo pricing plans" — not One App Free or Standard. Self-hosted Community has no such gate. https://www.odoo.com/documentation/18.0/developer/reference/external_api.html
- **Hosting/cost:** Community is open source (download free); paid plans: Standard $16.90/user/mo, Custom $25.50/user/mo (Custom includes on-premise Enterprise + API access). https://www.odoo.com/pricing
- **Deal-breakers:** Community lacks the exact barcode receiving flow we want; Enterprise pricing is per-user and pulls in whole-ERP gravity. Parts sync required either way.

### ERPNext (Frappe)

- **Fit:** Purchase Receipt is created from a PO, updates "Pending Quantity" on the PO for partial receipts, and writes Stock Ledger entries on submit. https://docs.frappe.io/erpnext/user/manual/en/purchase-receipt
- Stock Entry types include Material Issue (outgoing) and Material Receipt; project attribution via Accounting Dimensions ("Projects can be considered as a dimension"), though "issue against job" is a tagging convention, not a first-class job link. https://docs.frappe.io/erpnext/user/manual/en/stock-entry
- Valuation: FIFO and Moving Average, both documented with worked examples. https://docs.frappe.io/erpnext/user/manual/en/calculation-of-valuation-rate-in-fifo-and-moving-average
- Barcode scanning is supported in Purchase Receipt, Delivery Note, Stock Reconciliation, etc. https://docs.frappe.io/erpnext/track-items-using-barcode
- **API:** Frappe auto-generates REST CRUD for every DocType (POs, Purchase Receipts, Stock Entries included); token (`api_key:api_secret`), password, or OAuth auth; filters/pagination; whitelisted RPC methods. No published rate limits. https://docs.frappe.io/framework/user/en/api/rest
- **Hosting/cost:** GPL-3.0, free to self-host (Docker/Bench). https://github.com/frappe/erpnext. Managed Frappe Cloud is per-site/per-server (sites from ~$5/mo, servers from ~$40/mo), not per-user. https://frappe.io/cloud/pricing
- **Deal-breakers:** none hard, but it is a full ERP on Python + MariaDB — a second stack to operate and provision users in; ZAR is a supported currency dimension but the value is in modules we would not use. Strongest "integrate" candidate among the ERPs.

### Unleashed

- **Fit:** Receipt a PO with split/partial receipting — outstanding quantity rolls to an auto-created suffixed PO (PO-x/1, /2) and included costs feed landed cost. https://support.unleashedsoftware.com/hc/en-us/articles/4402275037081-How-to-Split-Receipt-a-Purchase-Order
- **Costing:** "Unleashed uses the average landed costs methodology only" — **no FIFO**. ALC = total stock value / total stock qty, recalculated on every transaction. https://support.unleashedsoftware.com/hc/en-us/articles/6829971343129-How-to-manage-Average-Landed-Costs
- No production-job costing concept for our "checkout to job" — Assemblies/BOM exist for building products, not issuing parts to an external job entity (API exposes Assemblies/BOM resources).
- **API:** REST-ish, JSON/XML; resources include Products, Purchase Orders, Stock Adjustments, Stock On Hand, Warehouses; editable vs read-only resources; API ID + key auth (account owner only); webhooks supported; **no partial updates — omitted fields are overwritten**. https://apidocs.unleashedsoftware.com/
- **Hosting/cost:** SaaS only. Core $399/mo (3 users, +$69/user), Pro $729/mo (5 users, +$89/user); API quota 250k/500k calls per month. https://www.unleashedsoftware.com/pricing/
- **Deal-breakers:** price (≈R7,200+/mo at ~R18/USD), ALC-only valuation, no job-issue concept, full-overwrite API updates make sync riskier.

### Katana

- **Fit:** PO receiving with true partial receipt ("Receive some…", PO becomes "Partially received", remainder stays Expected). https://support.katanamrp.com/en/articles/5944993-partially-receiving-a-purchase-order
- Manufacturing orders consume ingredient stock on completion (planned vs actual quantities, waste recorded) — a workable "checkout to job" if Jobs map to MOs. https://support.katanamrp.com/en/articles/5914371-manufacturing-orders, https://support.katanamrp.com/en/articles/5914331-completing-a-manufacturing-order-mo
- **Costing:** Moving Average Cost only; "FIFO/LIFO are not supported." https://support.katanamrp.com/en/articles/5966125-understanding-moving-average-cost-mac
- **API:** REST, OpenAPI 3.0 spec published; `Authorization: Bearer <API key>`; rate limit 60 requests/min; webhooks with HMAC-SHA256 signatures. https://developer.katanamrp.com/reference/api-introduction, https://developer.katanamrp.com/reference/api-authentication, https://developer.katanamrp.com/reference/api-rate-limiting, https://developer.katanamrp.com/reference/webhooks
- **Hosting/cost:** SaaS only. Free plan exists; Core from $299/mo with usage-based adjustments (sales orders, locations); unlimited users on all tiers. https://katanamrp.com/pricing/
- **Deal-breakers:** no FIFO; product is framed around making/selling finished goods (sales-order-driven), which we explicitly don't need; usage-based pricing; parts sync.

### Zoho Inventory

- **Fit:** Purchase Receives record deliveries against a PO, including partial receipt ("Partially Received" status; receive billed or unbilled items). https://www.zoho.com/us/inventory/help/purchase-orders/purchase-receive.html
- Valuation: FIFO and WAC per item, with a FIFO Cost Lot Tracking report. https://www.zoho.com/us/inventory/kb/items/item-inventory-evaluation.html
- **No manufacturing / issue-to-job concept.** The API module list covers items, orders, receives, warehouses, financial docs — nothing for consuming stock against a production job; the closest native concept is composite items (bundling). This is a functional miss for our core flow.
- Barcode *generation* is gated to the Premium tier; scanning into documents exists but plan-gated features apply. https://www.zoho.com/inventory/pricing/
- **API:** REST, OAuth 2.0, `organization_id` per request; rate limits 1,000–10,000 calls/day by plan, 100/min. Purchase receives and adjustments are exposed. https://www.zoho.com/inventory/api/v1/introduction/
- **Hosting/cost:** SaaS only, but has native ZAR pricing: Standard R199/mo → Enterprise R1,499/mo (annual billing), order-count and user limits per tier (Standard = 2 users, 500 orders/mo). https://www.zoho.com/inventory/pricing/
- **Deal-breakers:** no issue-to-job; daily API caps are tight for a sync-heavy integration; order/user limits.

### Cin7 Core (ex-DEAR)

- **Fit:** Partial receiving requires converting to an "Advanced Purchase" (multiple invoices/stock deliveries per PO); WMS mobile supports "Receive partially". https://help.core.cin7.com/hc/en-us/articles/9034446632975-Advanced-Purchase-Partial-Orders-Deliveries
- **Costing:** actual-cost methods including FIFO and FEFO (batch/serial variants); COGS from actual purchase cost of picked items. https://help.core.cin7.com/hc/en-us/articles/9034464614415-Costing-Methods
- **API:** developer portal at https://dearinventory.docs.apiary.io/ (help center: https://help.core.cin7.com/hc/en-us/sections/10207284005007-Cin7-API). Rate limits are applied per API application per minute and per day; the help-center pages returned 403 to automated fetches during this research, so exact limits were **not verified** — confirm before relying on sync throughput.
- **Hosting/cost:** SaaS only. Standard $349/mo (5 users), Pro $599/mo (10 users), Advanced $999/mo (15 users); **API access listed as a paid add-on on all tiers** on the current pricing page. https://www.cin7.com/pricing/
- **Deal-breakers:** price (≈R6,300+/mo) plus paying extra for the API that the integrate option depends on; retail/e-commerce framing; parts sync.

### InvenTree

- **Fit:** the closest off-the-shelf match to "supplier parts inventory". Parts-centric data model with supplier parts; PO states Pending → In Progress → Complete; per-line receiving with partial receipt (order completes when received ≥ ordered, or manually); line-item unit cost transfers onto the created stock items. https://docs.inventree.org/en/latest/purchasing/purchase_order/
- Barcode is first-class: scan to receive PO items (incl. ECIA 2D supplier barcodes from Digi-Key/Mouser), stock lookup, custom barcodes; companion Android/iOS app. https://docs.inventree.org/en/stable/app/barcode/, https://docs.inventree.org/en/latest/barcodes/custom/
- Build Orders allocate and consume stock against an assembly — a plausible "checkout to job" if Jobs map to builds. https://docs.inventree.org/en/latest/ (Build Orders section)
- **Costing caveat:** pricing is tracked as ranges/history (supplier price breaks, historical purchase cost, BOM cost) and per-stock-item purchase price, but there is **no formal FIFO or weighted-average valuation method or accounting-grade valuation report**. https://docs.inventree.org/en/latest/part/pricing/
- **API:** "The core InvenTree software is implemented on top of a RESTful API" — everything the UI does is API-doable; token auth; self-documenting schema at `/api-doc/`; Python client library; plugin system for events/extensions. https://docs.inventree.org/en/latest/api/
- **Hosting/cost:** MIT license, free; Python/Django/DRF; supports PostgreSQL (we already run Postgres). Docker deployment. https://github.com/inventree/InvenTree
- **Deal-breakers:** valuation would need to be computed by us from its stock-item cost data (at which point we're building the hard part anyway); a second Django app to run, upgrade, and provision users in; parts sync still required.

## The BUILD assessment

### What v1 actually is, on this codebase's patterns

New Drizzle tables (pkg/db/src/schema/):

- `purchase_order` — supplier FK, state (`draft → sent → partially-received → received`, + cancelled), currency ZAR, timestamps
- `purchase_order_line` — PO FK, part FK, qty ordered, unit price (this *is* the price history), qty received (derived or denormalized)
- `stock_movement` — **append-only ledger**: part FK, qty delta, movement type (`receipt | job-checkout | adjustment`), unit cost (receipts), reference FKs (PO line / job / adjustment reason), actor, timestamp. This is the load-bearing design decision: a mutable `quantity_on_hand` column cannot answer FIFO valuation, price history, or "parts checked out between dates" — the ledger answers all three, and SOH is `SUM(qty_delta)` per part (materialized later only if needed)
- optionally `stock_adjustment_reason` enum/table

That is 3–4 tables, comparable to the quote schema (148 lines) and smaller than jobs (321 lines).

API: one `inventoryRouter` (or `purchaseOrders` + `stock`) following `pkg/api/src/routes/*/*.router.ts` conventions — PO CRUD + state transitions, `receiveAgainstPo` (writes receipt movements, flips PO state when all lines full), `checkoutToJob` (validates against `job_cfo_part` quantities), `adjustStock`, `stockOnHand`, `movementHistory`, `checkedOutInPeriod`. Calibration: quotes router 156 lines, jobs router 266 lines — expect this to land between them, plus service files.

Web UI: PO list/detail/receive screens, stock page with adjustment modal, two report views — reuses existing table/form/page patterns (suppliers, quotes pages). Quotes web ≈ 3.6k LOC, jobs web ≈ 3.7k LOC; inventory should be similar.

Auth: extend the existing `APP_PERMISSIONS` enum (`pkg/schema/src/auth/authorization.ts`) with `purchase_order:*`, `stock:*` and grant to the existing `procurement-manager` role — the role already exists; no new auth machinery.

Barcode: two cheap paths, no new infra — (a) USB wedge scanners act as keyboards, so the web receive screen just needs a focused input that maps scanned supplier codes to PO lines (`parts.supplierCode` already exists); (b) the existing Expo app can add a camera-scan receive screen later. Neither blocks v1.

Costing: store unit cost on every receipt movement. Weighted-average SOH valuation is a windowed aggregate over the ledger; true FIFO layer consumption is the one genuinely fiddly algorithm (~a service file + solid tests). Recommend shipping weighted-average first (every SaaS candidate except Cin7/Zoho does only this) and adding FIFO from the same ledger if accounting requires it — the ledger design keeps both open.

**Rough size: one subsystem on the order of jobs — bigger than quoting, far smaller than the platform.** No fake person-weeks; the honest statement is "the same shape of effort as the jobs/scheduling subsystem was."

### What building avoids

- **Parts-identity sync** — the single biggest cost of every other option. Checkout-to-job becomes a foreign key, not an integration.
- User provisioning, roles, and audit in a second system (we already have `procurement-manager` and an audit table).
- Per-seat/per-order USD fees forever (R5.4k–R18k+/mo across the SaaS candidates).
- Teaching a small parts team a foreign UI shaped around finished-goods e-commerce.
- A second self-hosted stack (Python/Django or Python/MariaDB) on Railway alongside the existing Node/Postgres deployment.

### What building costs

- Engineering time and the correctness burden for valuation math and receipt/state-machine edge cases (returns, over-receipt, PO cancellation with partial receipts) — the vendors have already paid this.
- No free ecosystem: supplier EDI/ECIA barcode parsing, label printing, future multi-warehouse — all DIY later.
- Opportunity cost against other roadmap work.

## Integrate: why it loses here

The APIs make it technically real — ERPNext (REST on every DocType), InvenTree (API-first), Katana (OpenAPI + webhooks), Unleashed/Zoho/Cin7 (REST with quotas/add-ons). But "keep our UI, use their engine" means we still build the PO/receive/checkout screens *and* run or pay for the engine *and* own bidirectional parts sync *and* live within rate limits (Zoho 1–10k calls/day; Katana 60/min; Cin7 unverified). For a single-site parts store with one shared parts identity, the engine being replaced is ~4 tables and one router. The sync alone is comparable in size to the thing it replaces.

## What would change the answer

- **Multi-warehouse, lot/serial tracking, or MRP appears on the roadmap** → InvenTree (self-host, Postgres, API-first, MIT) becomes the engine, our UI on top; revisit integrate.
- **Accounting integration becomes mandatory** (inventory valuation must post to a GL, auditors want a recognized system) → ERPNext or Odoo Enterprise; building GL-grade accounting is out of scope for us.
- **Finished-goods inventory + sales-channel needs emerge** → the SaaS candidates (Cin7, Unleashed, Katana) start justifying their price.
- **The parts-identity constraint dissolves** (e.g. the business decides the inventory system may be the parts master and Jobs/BOM can read from it) → the biggest build advantage evaporates; InvenTree-as-master becomes attractive.
- **Engineering capacity collapses** → Zoho Inventory (ZAR pricing, FIFO/WAC, cheap) as a stopgap despite the job-checkout gap, with checkout done as manual adjustments tagged by reason — ugly but functional.

## Open questions (feed other wayfinder tickets)

1. **Valuation method decision** — does the accountant require FIFO, or is weighted average acceptable for a ZAR parts store? Determines whether the FIFO layer-consumption service is v1 or v2.
2. **Over-receipt, returns-to-supplier, and PO cancellation semantics** — product team hasn't specified; each adds movement types and state transitions.
3. **Is checkout-to-job all-or-nothing per CFO line, or incremental?** Affects the checkout UI and the reconciliation report.
4. **Barcode reality check** — do supplier labels actually carry `parts.supplierCode` as scannable barcodes, or do we need to print our own labels at receiving? (Determines whether a label-printing story is in scope.)
5. **Opening-balance migration** — how do we load current physical stock and at what cost basis? (Physical count + opening-adjustment movements at last-known price is the default plan.)
6. **Multi-site future** — "single site as far as we know" needs confirmation; the ledger should carry a location column from day one if there is any doubt.
7. **Who approves POs?** Roles today have `procurement-manager`; is there an approval step (draft → approved → sent) before a PO goes to a supplier?
