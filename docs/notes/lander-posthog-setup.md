# Lander PostHog dashboard and insight setup

Research date: 2026-07-30.

This note proposes a concrete PostHog setup for the production Lander, using the exact events and
properties in the [Lander analytics contract](../../pkg/lander/ANALYTICS.md). Product capability
claims cite current first-party PostHog documentation. This repo keeps research notes in
`docs/notes/`, so this file follows that convention.

## Recommendation in one page

Use three surfaces, each for a different job:

1. **PostHog Web Analytics** for acquisition and basic website health: visitors, sessions,
   pageviews, bounce rate, entry/exit paths, channels, referrers, campaigns, devices, and geography.
   It already derives sessions and channel attribution from `$pageview`, referrer, and UTM data, so
   rebuilding these as custom insights would create duplicate definitions
   ([Web Analytics](https://posthog.com/docs/web-analytics)).
2. **`Lander — Growth & Leads` dashboard** for the commercial outcome: successful contact
   submissions, phone/WhatsApp intent, visitor-to-intent conversion, CTA effectiveness, equipment
   demand, and contact-form reliability.
3. **`Lander — Product Discovery` dashboard** for what visitors want and where discovery breaks:
   range/card/filter usage, product demand, the catalog-to-product funnel, brochure/share
   engagement, and language switching.

Treat `contact_submitted` as a **successful contact-form submission**, and separately report a broader **contact
intent** series:

```text
contact_submitted
OR phone_link_clicked
OR social_link_clicked where platform = whatsapp
```

Do not label any of these events as a qualified lead: a form submission can still be spam or
unqualified, while a phone or WhatsApp click does not prove that a conversation happened. PostHog
Trends and Funnels can combine events inline with logical `OR`, so this does not require a new
application event. Because this combination is reused across several insights, define it once as
a PostHog Action named `Lander / Contact intent`; inline combinations remain a fallback
([Trends](https://posthog.com/docs/product-analytics/trends/overview),
[Funnels](https://posthog.com/docs/product-analytics/funnels)).

For the first month, default dashboard range to **last 30 days, daily** and show comparison to the
previous period. Once there are roughly three months of data, use **last 90 days, weekly** for the
main time-series tiles. Keep a dashboard-level `language` filter available, but leave it unset by
default so English and Afrikaans remain comparable. Dashboard filters can apply event/person
properties or cohorts across tiles, and an insight may appear on more than one dashboard
([Dashboards](https://posthog.com/docs/product-analytics/dashboards)).

## Before building the dashboards

### 1. Set project hygiene

- Confirm the project timezone is `Africa/Johannesburg`, because daily/weekly boundaries, scheduled
  reports, and alert quiet hours use the project timezone
  ([Subscriptions](https://posthog.com/docs/product-analytics/subscriptions),
  [Alerts](https://posthog.com/docs/alerts)).
- In Product Analytics settings, configure **Filter out internal and test users**. At minimum
  exclude localhost, preview/staging hosts, synthetic monitors, and known test traffic. The filter
  is available as a toggle on insights
  ([internal-user filtering](https://posthog.com/tutorials/filter-internal-users)).
- Add `$virt_is_bot = false` to the two business dashboards. PostHog classifies captured traffic at
  query time and exposes virtual properties for filtering/breakdowns; preserving the raw events
  keeps a separate bot/AI analysis possible
  ([bot detection](https://posthog.com/docs/web-analytics/bot-detection),
  [managing bot traffic](https://posthog.com/docs/web-analytics/managing-bot-traffic)).
- If the plan supports it, add a path-cleaning rule that maps
  `/products/<model-code>` to `/products/:modelCode`. The same rule naturally leaves the locale
  prefix visible (`/af/products/:modelCode`), while stopping each product detail URL from
  fragmenting entry/exit and paths reports. Path cleaning applies across Web Analytics and Product
  Analytics but is a paid feature
  ([path cleaning](https://posthog.com/docs/web-analytics/path-cleaning)).

### 2. Document and verify the event catalog

In **Data Management → Events**, give every custom event:

- the description from `pkg/lander/ANALYTICS.md`;
- owner `Lander`;
- tag `lander`;
- verification status `verified` after checking a live example;
- property descriptions, types, and allowed values copied from the contract.

PostHog exposes event descriptions, tags, verification status, first/last seen timestamps, property
types and examples, and keeps a history of definition changes and ingestion warnings
([Data management](https://posthog.com/docs/data)).

PostHog's newer schema management can define required typed properties through reusable property
groups. It is currently experimental, but it is a good second line of defence behind the Lander's
existing TypeScript registry. Start with a required `language: string` group on every listed event,
then add event-specific property groups. Schema management supports string/number/boolean/object
types and required properties, but not the contract's enum value sets, so keep
`ANALYTICS.md` and the TypeScript registry authoritative for allowed values
([Schema management](https://posthog.com/docs/product-analytics/schema-management)).

### 3. Establish naming and metric rules

Use the prefix `Lander /` on every saved insight. Put the question being answered in the insight
description, including:

- event(s), aggregation, filters, and funnel window;
- whether the result is a confirmed outcome or only intent;
- why `Total count`, `Unique users`, or `Unique sessions` is used;
- a link to `pkg/lander/ANALYTICS.md`.

Use **Total count** for business transactions and technical attempts (`contact_submitted`,
`contact_submit_failed`, brochure-link clicks), and **Unique users** for reach or conversion
(visitors who viewed a product, visitors who showed contact intent). PostHog defines Total count as
all occurrences and Unique users as one count per user per period
([aggregations](https://posthog.com/docs/product-analytics/trends/aggregations)).

## Dashboard 1: `Lander — Growth & Leads`

Create these saved insights in this order.

| Tile | PostHog setup | Display | Why |
| --- | --- | --- | --- |
| **Lander / Visitors** | `$pageview`, Unique users; `$virt_is_bot = false` | Number, 30d, compare previous period | Reach; Web Analytics remains the canonical detailed traffic view |
| **Lander / Successful contact submissions** | `contact_submitted`, Total count | Number, 30d, compare | Successful form submissions; qualification is not yet tracked |
| **Lander / Contact-intent visitors** | Inline-combined `contact_submitted` OR `phone_link_clicked` OR `social_link_clicked` filtered to `platform = whatsapp`; Unique users | Number, 30d, compare | Broad leading indicator without overstating it as a completed lead |
| **Lander / Visitor → contact intent** | Funnel: `$pageview` → the inline-combined contact-intent step; sequential; conversion window 1 day | Funnel steps | Site-level conversion rate |
| **Lander / Traffic and intent trend** | Series A `$pageview` Unique users; series B combined contact intent Unique users | Line, daily; 90d weekly after enough data | Shows whether demand and intent move together |
| **Lander / Contact channel mix** | Three series: `contact_submitted`; `phone_link_clicked`; `social_link_clicked` filtered `platform = whatsapp`; Total count | Total-value bar | Separates form, phone, and WhatsApp behaviour |
| **Lander / Contact submissions by equipment** | `contact_submitted`, Total count, breakdown `equipment` | Bar/table | Which equipment is named in successful enquiries |
| **Lander / Contact page → successful submission** | Funnel: `$pageview` with `$pathname` equal to `/contact` or `/af/contact` → `contact_submitted`; sequential; 1 day | Funnel, breakdown `language` | Form-page conversion |
| **Lander / Contact-submit failure rate** | A = `contact_submit_failed` Total count; B = `contact_submitted` Total count; formula `100 * A / (A + B)` | Line + number | Technical failure share of recorded submit attempts |
| **Lander / Contact failures by category** | `contact_submit_failed`, Total count, breakdown `errorCategory` | Daily bar | Distinguishes network from server failures |
| **Lander / CTA usage** | `cta_clicked`, Total count, breakdown `cta`, secondary breakdown `language` | Bar/table | Compares `hero_contact`, `hero_products`, and `bottom_band_contact` |
| **Lander / Contact CTA → intent** | `cta_clicked` filtered to `cta = hero_contact` OR `bottom_band_contact` → combined contact intent; sequential; 1 day | Funnel, breakdown `cta` from step 1 | Whether contact CTAs create downstream intent |
| **Lander / Phone-link placement** | `phone_link_clicked`, Total count, breakdown `placement` | Bar | Whether nav, footer, contact page, or product detail drives calls |

Trends support property filtering, multiple series, property breakdowns, total/unique aggregation,
and inline event combinations. Formulas can divide or otherwise combine named series
([Trends](https://posthog.com/docs/product-analytics/trends/overview),
[formulas](https://posthog.com/docs/product-analytics/trends/formulas),
[breakdowns](https://posthog.com/docs/product-analytics/trends/breakdowns)).

Funnels should use **sequential**, not strict, order: intervening pageviews or autocapture events
are expected. Funnel steps may be filtered by event properties, can combine alternatives using
`OR`, and expose both overall and step-relative conversion. Funnel breakdowns should use
first-touch attribution for `language`, but `Specific step / Step 1` for properties such as `cta`
that only exist on the first step
([Funnels](https://posthog.com/docs/product-analytics/funnels)).

## Dashboard 2: `Lander — Product Discovery`

| Tile | PostHog setup | Display | Why |
| --- | --- | --- | --- |
| **Lander / Catalog visitors** | `$pageview`, Unique users, `$pathname` is `/products` or `/af/products` | Number + daily line | Catalog reach |
| **Lander / Home range demand** | `range_card_clicked`, Total count, breakdown `rangeSlug`; add `rangeName` in table | Bar/table | Which range visitors choose |
| **Lander / Range-card position** | `range_card_clicked`, Total count, breakdown numeric `position` | Bar | Detects grid-position bias |
| **Lander / Catalog filter users** | `catalog_filter_changed`, Unique users | Number + daily line | Filter adoption |
| **Lander / Filter selections** | `catalog_filter_changed`, Total count, breakdown `range`, then `variant` | Table | Which filters visitors actively choose; `null` means cleared/no variant |
| **Lander / Product-card clicks** | `product_card_clicked`, Total count, breakdown `modelCode` | Bar/table | Catalog click demand |
| **Lander / Product-card position** | `product_card_clicked`, Total count, breakdown numeric `position` | Bar | Detects ordering bias in the visible filtered catalog |
| **Lander / Product demand** | `product_viewed`, Unique users, breakdown `modelCode` | Bar/table | Product-detail reach, less distorted by repeat views |
| **Lander / Product engagement** | Three series: `brochure_downloaded`, `product_shared`, and `phone_link_clicked` filtered to `placement = product_detail`; Total count | Total-value bar | High-intent actions on product detail |
| **Lander / Brochure clicks by model** | `brochure_downloaded`, Total count, breakdown `modelCode` | Table | Products whose brochure link visitors click; delivery is not confirmed |
| **Lander / Share method** | `product_shared`, Total count, breakdown `method` | Bar | Native share vs copied link |
| **Lander / Catalog → product → engagement** | `$pageview` on catalog → `product_card_clicked` → `product_viewed` → inline `brochure_downloaded` OR `product_shared` OR `phone_link_clicked` where `placement = product_detail`; sequential; 1 day | Funnel | Main product-research journey |
| **Lander / Filter → product** | `catalog_filter_changed` → `product_card_clicked` → `product_viewed`; sequential; 1 day | Funnel; duplicate once for `language`, once for device type | Whether filtering helps product discovery |
| **Lander / Language switching** | `language_switched`, Total count, breakdown `fromLocale`, `toLocale`, then `placement` | Table | Direction and location of locale changes |
| **Lander / Social outbound clicks** | `social_link_clicked`, Total count, breakdown `platform`, then `placement` | Bar/table | Separates Instagram discovery from WhatsApp contact intent |

The first funnel is deliberately not `range_card_clicked → product_card_clicked → product_viewed`:
visitors can enter the catalog from the hero products CTA, navigation, search, or a direct link.
Optional steps would undercount valid journeys. PostHog recommends starting with the simplest
required steps and can open paths or session replays directly from funnel drop-offs
([Funnels](https://posthog.com/docs/product-analytics/funnels)).

## Web Analytics configuration

Keep Web Analytics as the acquisition workspace and review weekly:

- visitors, sessions, pageviews, bounce rate;
- top pages and entry/exit paths;
- channel, referrer, UTM source/medium/campaign;
- geography, device, browser, and operating system;
- outbound links;
- human traffic by default, with an optional saved view for AI-agent traffic.

These are native Web Analytics measures derived from `$pageview`, sessions, referrers, and UTM
tags; every traffic row can be followed into replay or deeper product analysis
([Web Analytics](https://posthog.com/docs/web-analytics)).

Do not infer lead attribution only from the final page's URL or referrer. Use the
visitor-to-contact funnel, break it down by **first-touch** channel/session properties, and compare
channel quality by conversion rather than pageviews alone. Funnel attribution can select first,
last, all, or a specific step's property value
([funnel attribution](https://posthog.com/docs/product-analytics/funnels)).

If knowing which AI/search crawlers read the site matters, client-side `$pageview` is incomplete
because many crawlers do not execute JavaScript. PostHog can classify forwarded `$http_log` events,
but adding a Railway/CDN log pipeline is a separate implementation decision, not part of this
dashboard setup
([bot detection](https://posthog.com/docs/web-analytics/bot-detection)).

## Paths, retention, lifecycle, and cohorts

### Paths: yes, for diagnosis

Create one saved path:

- event types: pageviews + the custom events in the contract;
- start at `/` or `/af/`;
- 5 steps;
- exclude analytics proxy/static routes and non-content routes;
- apply the product-detail path-cleaning rule if available.

Use it to learn the real route from home to catalog/product/contact. More importantly, open a path
from a specific funnel drop-off, where PostHog can show paths before/after or between funnel steps.
Paths report distinct people moving between steps and can link a node to recordings
([Paths](https://posthog.com/docs/product-analytics/paths),
[funnel path exploration](https://posthog.com/docs/product-analytics/funnels)).

### Retention: optional and secondary

After 8–12 weeks, try a monthly retention diagnostic:

- start: `product_viewed`;
- return: `$pageview` or `product_viewed`;
- interval: month;
- compare `language` and acquisition channel.

PostHog retention uses a start event and return event for the same user and supports hourly through
monthly periods, filters, and breakdowns
([Retention](https://posthog.com/docs/product-analytics/retention)).

This is not a launch KPI. Agricultural-equipment research is naturally low frequency, and this
public Lander does not identify visitors. Results represent a browser's anonymous distinct ID, not
a known person across devices or cleared cookies.

### Lifecycle and cohorts: do not use yet

Do not put lifecycle or behavioural cohorts on either launch dashboard:

- Lifecycle explicitly excludes anonymous events, so it would misrepresent this anonymous public
  site
  ([Lifecycle](https://posthog.com/docs/product-analytics/lifecycle)).
- PostHog documents that cohorts rely on person properties and identified events. They become useful
  only if a later privacy-reviewed design identifies a stable CRM/customer ID
  ([Cohorts](https://posthog.com/docs/data/cohorts)).

Setting `language` as a person property does not itself make an anonymous browser a reliable
cross-device customer identity. Avoid adding email/phone/form content to analytics merely to unlock
cohorts.

## Session replay

Enable replay as a qualitative diagnostic, with explicit privacy settings:

1. Start at 100% while volume is low and the team is validating production behaviour; PostHog's
   guidance is to begin at 100% and reduce sampling after learning actual volume
   ([recording controls](https://posthog.com/docs/session-replay/how-to-control-which-sessions-you-record)).
2. After the initial review, use trigger groups:
   - 100% of sessions containing `contact_submit_failed`;
   - 100% of sessions containing `contact_submitted`;
   - 10–20% of all other sessions, with a modest minimum duration to remove instant bounces.
3. Save replay filters for:
   - contact failures;
   - contact-page drop-offs;
   - catalog filter users who did not reach `product_viewed`;
   - mobile product-detail sessions;
   - Afrikaans sessions.
4. Review 10–20 relevant recordings weekly, starting from the funnel's largest drop-off rather than
   watching random sessions.

Event-triggered recording keeps an in-memory web buffer of up to roughly one minute before the
trigger and then continues for the rest of the session. Trigger groups can combine event/URL
conditions, sampling, and minimum duration
([recording triggers](https://posthog.com/docs/session-replay/how-to-control-which-sessions-you-record)).

Keep **all contact-form inputs masked**. PostHog masks inputs by default and applies privacy controls
in the browser before data is sent, but verify the live recording. Do not record request/response
bodies for `/api/contact` unless a scrubber is proven to remove names, email addresses, phone
numbers, and messages. Query strings should also be stripped or redacted if they can ever contain
personal data
([Replay privacy](https://posthog.com/docs/session-replay/privacy)).

## Alerts, subscriptions, and annotations

### Subscriptions

Create one weekly Monday 08:00 `Africa/Johannesburg` subscription to email or the team's analytics
Slack channel containing no more than these six tiles:

1. Visitors
2. Successful contact submissions
3. Contact-intent visitors
4. Visitor → contact intent
5. Catalog → product → engagement
6. Contact-submit failure rate

Subscriptions can deliver an insight or dashboard by email/Slack on daily, weekly, monthly, or
custom schedules, and a dashboard subscription can select up to six insights. Test the delivery
immediately after setup
([Subscriptions](https://posthog.com/docs/product-analytics/subscriptions)).

### Alerts

Start with only actionable alerts:

- **Contact failure spike:** `contact_submit_failed` is greater than an initially conservative
  daily threshold (for example, 2); notify the engineer responsible for the Lander.
- **Failure-rate guardrail:** contact-submit failure rate exceeds a threshold once there is enough
  denominator volume. Use a Trends formula or HogQL insight so one failure after one attempt does
  not create a misleading operational incident.
- **Traffic/capture outage:** `$pageview` falls below a daily threshold only after the normal
  production baseline is known. Until then, use the weekly subscription.
- **Conversion regression:** add an alert to the visitor-to-contact funnel only after several weeks
  establish a stable baseline.

PostHog alerts support Trends, Funnel, and HogQL insights; absolute/relative thresholds, scheduled
checks, funnel conversion thresholds, multiple destinations, and quiet hours. The free tier allows
five alerts. Anomaly detection exists but is still a feature preview and needs enough historical
points to learn a useful baseline
([Alerts](https://posthog.com/docs/alerts)).

### Annotations

Add a project annotation for every:

- production Lander deployment that changes UX, content, routing, or analytics;
- campaign start/stop;
- brochure/catalog content release;
- analytics incident or tracking fix.

Annotations appear on time-series insights and dashboards and are specifically intended to connect
releases, incidents, and campaigns with metric changes
([Annotations](https://posthog.com/docs/data/annotations)).

## Contract improvements worth making next

These are future analytics-contract changes, not required to create the dashboards above.

1. **Normalize Range identity.** `range` is a slug on catalog events but a display name on
   `product_viewed`; `range_card_clicked` uses `rangeSlug` plus `rangeName`. Add both
   `rangeSlug` and `rangeName` consistently to product/range events. Do not silently change the
   meaning of existing `range`.
2. **Make equipment canonical.** `contact_submitted.equipment` currently stores selected equipment
   or a localized “not specified” string. Add a stable canonical equipment/range slug and
   `equipmentSpecified: boolean`, retaining localized display text only if it is analytically
   useful. This prevents English/Afrikaans values from splitting one category.
3. **Measure form abandonment.** Add `contact_form_started` (or a privacy-safe first-interaction
   event) and optionally `contact_validation_failed` with field category only. The current contract
   can measure submit success/failure, but not visitors who start and abandon before submit.
4. **Add a stable content version or deploy SHA super property.** This makes a regression
   attributable even when an annotation was missed.
5. **Add an explicit internal/test super property** for production-domain staff and synthetic
   traffic, since host filters cannot distinguish staff browsing the real site.
6. **Connect lead outcomes outside PostHog.** Form submit is not revenue. Eventually send a
   privacy-reviewed, opaque lead ID and downstream CRM milestones such as `lead_qualified` or
   `quote_requested` server-side, or join CRM data in the warehouse. Until that exists, call the
   metric “web leads,” not sales conversion.

Each contract change should be made in the typed registry and `ANALYTICS.md` together, per the
package instructions.

## Experiments and feature flags

Do not start A/B tests merely because experiments are available. First collect a stable baseline
for visitor-to-contact intent and contact-submit health, then use PostHog's recommended run-time
calculation to decide whether traffic and conversions can detect a meaningful effect. PostHog's
first-party guidance says experiments need sufficient sample size and should be avoided when
traffic cannot reach significance
([PostHog experimentation guidance](https://newsletter.posthog.com/p/10-things-weve-learned-about-ab-testing)).

When volume is sufficient, sensible first experiments are:

- contact CTA copy/placement, primary metric contact intent;
- catalog card ordering, primary metric `product_viewed`;
- brochure prominence, primary metric `brochure_downloaded`;
- Afrikaans/English-specific content changes, analyzed separately by language.

For every experiment, use contact-submit failure rate and page bounce as guardrails, segment by
device and language, and annotate the start/end. Feature flags are also useful for phased rollouts
even when there is not enough traffic for a statistically powered experiment.

## Setup order

1. Verify timezone, production domain, internal/test filtering, and bot filtering.
2. Document/verify all events and properties in Data Management.
3. Use Web Analytics as the acquisition baseline.
4. Create `Lander — Growth & Leads` and its first six core tiles.
5. Create `Lander — Product Discovery`.
6. Configure replay privacy, sampling, trigger groups, and saved filters.
7. Add the weekly six-tile subscription.
8. Add only the contact-failure alert initially.
9. After 4–8 weeks, set thresholds from observed baselines; after 8–12 weeks, consider retention and
   whether experiment sample sizes are realistic.
