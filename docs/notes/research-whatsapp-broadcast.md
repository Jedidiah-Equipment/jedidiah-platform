# WhatsApp Read-Only Broadcast Feasibility and Cost

Date: 2026-08-31

**Question:** Can the app post to a read-only WhatsApp broadcast surface programmatically, and what
does it cost? Context: push app events (e.g. new machine breakdown reports, with photos) to staff as
WhatsApp notifications instead of building an in-app push system. Staff must not be able to reply in
that surface.

Claims below trace to first-party Meta/WhatsApp sources (developers.facebook.com, faq.whatsapp.com,
twilio.com) as of 2026-08-31; exceptions are flagged in "Unverified / secondary" at the end. Wayfinder
map: #1359, ticket #1368.

## Answer / recommendation

**There is no official API for any truly read-only WhatsApp surface.** WhatsApp Channels are exactly
the surface described — one-way, followers cannot reply — but Meta exposes zero API endpoints for
Channels; posting is manual, in-app, by a human admin only. The only Meta-sanctioned programmatic
path is the **WhatsApp Business Platform (Cloud API) sending an approved utility template message
individually to each staff member's number**, which is two-way by design: staff can always reply, but
replies arrive as webhook events the backend can silently drop or answer with a single "this number is
notification-only" auto-reply.

**Recommended mechanism:** direct Meta Cloud API (no BSP), a new dedicated phone number, one approved
**utility** template with an image header for the breakdown photo (e.g. "Breakdown report {{1}} —
{{2}} at {{3}}", optional URL button deep-linking into the app), sent per-staff-number from the
existing backend. Collect written opt-in from staff and have them save the contact.

**Cost:** South Africa utility rate is **$0.0076/message (≈ R0.13)**. Illustrative 20 staff × 5
notifications/day × 30 days = 3,000 messages/month ≈ **$22.80 ≈ R400/month** (≈ R460 with 15% VAT,
unverified). Until 2026-10-01, utility templates inside an open 24-hour customer-service window are
free, so real spend starts lower. Worst case, if the template were classified marketing: $0.0379/msg
(≈ R1,990/month) — and the plan breaks anyway because Meta's per-user marketing limits (~1–2
marketing templates per user per day across all businesses) block 5/day.

**Counterpoint worth weighing:** the mobile app runs on Expo, where `expo-notifications` push has zero
per-message cost and genuinely no reply surface. WhatsApp buys familiarity and photos-in-notification
at ~13c each.

## Option comparison

### 1. WhatsApp Channels — read-only, but no API

- Channel updates are a one-way broadcast; followers can't reply to updates or message admins — only
  emoji reactions and poll votes ("About WhatsApp Channels",
  https://faq.whatsapp.com/549900560675125). This is precisely the desired surface.
- The Cloud API docs (https://developers.facebook.com/docs/whatsapp/cloud-api) contain **no Channels
  endpoints**; the supported surfaces are 1:1 messages and (since 2025) small Groups. Channels never
  appears as an API object anywhere in the business-messaging doc tree.
- Only unofficial, reverse-engineered providers (whapi.cloud, maytapi) offer "Channel APIs" by
  puppeting a logged-in WhatsApp Web session. Not Meta products, ToS-violating, ban-prone. Do not
  build a business process on them.
- A channel could be posted to manually from the WhatsApp Business app
  (https://faq.whatsapp.com/809740894165112), but that defeats automatic app-event push.

### 2. Cloud API template messages to a recipient list — the supported "broadcast"

Fully supported; this is what Meta means by broadcast: the server loops over staff numbers and sends
each an approved template. Details below.

### 3. Broadcast lists (consumer/Business app feature) — not API-accessible

Phone-app-only: up to 256 saved contacts per list, delivered only to recipients who have saved the
sender's number (silently dropped otherwise). No API exists. (Mechanics corroborated by secondary
sources; exact FAQ page not fetched.) Irrelevant for programmatic use.

### 4. Groups via the Cloud API — real 2025 API, disqualified

Meta shipped a Groups API (~Oct 2025):
https://developers.facebook.com/documentation/business-messaging/whatsapp/groups. Requires an
**Official Business Account** (blue-check tier, hard for a small contractor to obtain); **max 8
participants per group**; members join via invite links; up to 10,000 groups per number; no
announcement-only / admin-only-posting mode, so members can chat. The 8-participant cap (we have
~20 staff) and the lack of read-only mode both disqualify it.

## Cloud API path in detail

### Pricing (https://developers.facebook.com/docs/whatsapp/pricing)

- **Per-message pricing since 2025-07-01** (replaced conversation-based pricing). Charged only when
  a template message is delivered; rate depends on template category + recipient country (+27 →
  "South Africa" on the rate card).
- South Africa list rates from Meta's official USD rate-card CSV (effective 2026-07-01):
  **Marketing $0.0379 · Utility $0.0076 · Authentication $0.0076** (authentication-international
  $0.0200).
- Free today: non-template messages inside an open 24-hour customer-service window (CSW), utility
  templates inside an open CSW, and messages inside a 72-hour free-entry-point window.
- **From 2026-10-01** service (non-template) messages are charged per-message and utility templates
  inside the CSW stop being free
  (https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages).
  Budget as if every notification costs the utility rate from that date.
- Volume discounts on SA utility only start above 100,000 messages/month
  (https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/volume-tiers) —
  irrelevant at our volume.

### Utility vs marketing classification

Per https://developers.facebook.com/docs/whatsapp/updates-to-pricing/new-template-guidelines, utility
templates must be non-promotional and either specific to the user's account/transaction or "essential
or critical to the user" (e.g. safety alerts). An operational breakdown alert to an opted-in staff
member is non-promotional and relationship-specific — it should classify as **utility**. Meta's
classifier assigns category at review time and ambiguous content defaults to marketing, so write the
template dryly and factually; misclassification can be appealed/resubmitted. If forced to marketing
the plan breaks: per-user marketing limits
(https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits)
cap marketing templates a user may receive (~1–2/day across all businesses; excess sends fail with
error 131049).

### Setup requirements

- Meta Business Portfolio + a WhatsApp Business Account (WABA).
- **Dedicated phone number** — a number already in use with WhatsApp cannot be registered unless
  deleted first (https://developers.facebook.com/docs/whatsapp/phone-numbers); it cannot
  simultaneously serve the consumer/Business app. Buy a new SIM/virtual number.
- Display name submitted at registration, subject to Meta's display-name rules.
- **Business verification** is not required to start (base messaging limit applies) but unlocks the
  2,000-recipient tier and raises the phone-number cap from 2 to 20.
- **Opt-in is mandatory** before business-initiated messages
  (https://developers.facebook.com/docs/whatsapp/overview/getting-opt-in); method is up to the
  business — a signed staff form suffices. Trivial for ~20 employees.

### Constraints

- **Messaging limits** (https://developers.facebook.com/docs/whatsapp/messaging-limits): new
  portfolios start at 250 unique recipients/24h, then 2,000 (via verification or 2,000 high-quality
  delivered templates in 30 days), then 10,000 → 100,000 → unlimited via automatic scaling. 20 staff
  is far below the 250 floor — a non-issue.
- **Template pre-approval**: automated review, up to 24 hours
  (https://developers.facebook.com/docs/whatsapp/message-templates/guidelines); utility templates
  often clear in minutes.
- **Quality rating / pausing**: templates are paused on recurring negative feedback or low read
  rates. Staff blocking/reporting the number degrades quality — have them save the contact and don't
  over-send.
- **Media**: templates support an image header — perfect for the breakdown photo. Cloud API image
  limits: JPEG/PNG, 5 MB max
  (https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media); documents up to 100 MB.
- **24-hour CSW**: any staff reply opens a 24h window allowing free-form messages — useful for
  richer follow-ups, and until 2026-10-01 makes in-window utility sends free.

### Can replies be prevented?

**No.** Nothing in the Business Platform docs offers a read-only/announcement mode for 1:1
messaging; the pricing and window model presumes recipients can message the business. Replies are
webhook events that never surface unless the backend surfaces them — drop silently or send one
auto-reply template ("This number is notification-only — contact the office on ..."). Note this is a
negative claim resting on absence across the official docs, not an explicit Meta statement.

### Direct Cloud API vs BSP

- **Direct Meta Cloud API**: no markup — Meta's per-message rates only, billed via Meta Business
  Suite. More setup work (webhook endpoint, token management, media upload) — all comfortable given
  we already run our own API backend.
- **BSP (e.g. Twilio)**: $0.005/message inbound or outbound on top of Meta's fees
  (https://www.twilio.com/en-us/whatsapp/pricing) — ~$15/month extra at 3,000 msgs, nearly doubling
  cost, for easier onboarding we don't need.

## Illustrative monthly cost (South Africa)

Assumptions: 20 staff × 5 notifications/day × 30 days = 3,000 utility messages/month; USD/ZAR ≈ 17.50.

| Scenario | USD/msg | USD/month | ≈ ZAR/month |
|---|---|---|---|
| Utility, direct Cloud API (steady state, post-Oct 2026) | $0.0076 | $22.80 | ≈ R400 |
| Utility, until 2026-10-01, sends inside an open CSW | $0 in-window | $0–$22.80 | R0–R400 |
| Worst case: forced to Marketing | $0.0379 | $113.70 | ≈ R1,990 — and blocked by per-user marketing limits at 5/day |
| Utility via Twilio (Meta + $0.005 fee) | $0.0126 | $37.80 | ≈ R660 |

Add possible 15% VAT (unverified): R400 → ≈ R460.

## Unverified / secondary

- Channels FAQ deep-link (faq.whatsapp.com/1918233232640244) 404'd; one-way/no-reply behavior
  confirmed via "About WhatsApp Channels" (faq.whatsapp.com/549900560675125).
- Broadcast-list mechanics (256 contacts, saved-contact requirement): consistent across secondary
  sources; exact FAQ article not fetched.
- "No Channels API" is verified by absence across Meta's official docs; Meta publishes no explicit
  statement.
- 15% SA VAT on Meta billing: secondary source (chatmaxima.com), unverified.
- Per-user marketing limit numbers (~2/day, error 131049): official doc URL located, but the numeric
  details came from BSP summaries of it.
