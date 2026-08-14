# Lander Analytics Contract

This file is the reporting contract for the Lander's typed analytics registry. Update it in the same PR as any registry change.

## Every event and pageview

The active Locale is registered as a PostHog super property and is also set as a person property via `$set`.

| Property | Type | Values |
| --- | --- | --- |
| `language` | string | `en`, `af` — the Locale the visitor is browsing in |

## Pageviews

`$pageview` is PostHog's built-in event, fired on initial load and on SPA navigations (`history_change`). It has no custom properties beyond PostHog defaults and `language`.

## Meta Ads

When `VITE_META_PIXEL_ID` is configured at build time, every server-rendered page includes the Meta Pixel base code in `<head>`. It initializes that Pixel and sends one initial `PageView`; the document body includes Meta's hidden `noscript` PageView image for browsers with JavaScript disabled. Completed client-side navigations send one further `PageView`, while the initial router resolution and same-URL loader refreshes do not duplicate it. The integration is off when the variable is unset, which keeps local and unconfigured environments out of the live advertising dataset.

Marketing-consent controls are explicitly outside the current integration scope. This section records technical behavior, not a determination that the deployment's privacy obligations are satisfied.

The Lander and its Railway edge currently send no Content Security Policy. If a CSP is introduced, Meta requires `https://connect.facebook.net` in `script-src` and `https://www.facebook.com` in `img-src`; omitting either silently breaks its corresponding base-code request.

A successful Contact form response sends Meta's `Lead` event in the browser. The same generated `metaEventId` is attached to PostHog's `contact_submitted` event so the Meta Ads Conversions destination can use it as `event_id` and deduplicate the browser and server events. Failed or blocked submissions send no Meta Lead. Contact-form PII is not added to either analytics event.

Meta's `ViewContent` event fires on the catalog (`/products` and `/af/products`), on each Range/Variant filter URL change there, and on every valid Product detail view (`/products/:modelCode` and its Afrikaans equivalent). Each browser event shares its generated `metaEventId` with the corresponding `catalog_viewed` or `product_viewed` PostHog event for Conversions API deduplication. Unknown Product URLs do not fire it because the detail component never mounts.

### Conversions API customer matching

Meta rejects a server event whose user data holds no usable customer-matching identifier (`error_subcode 2804050`), and a `client_user_agent` on its own does not qualify. So the three Conversions API events — `contact_submitted`, `product_viewed`, and `catalog_viewed` — each carry whatever identifiers the browser holds:

| Property | Source | Meta `user_data` field |
| --- | --- | --- |
| `metaBrowserId` | Meta's first-party `_fbp` cookie | `fbp` |
| `metaClickId` | Meta's first-party `_fbc` cookie, or a value derived from the URL's `fbclid` in Meta's documented `fb.1.<timestamp>.<fbclid>` shape when the cookie has not been written yet | `fbc` |

Both properties are also omitted entirely when `VITE_META_PIXEL_ID` is unset, so a build running PostHog without a Pixel cannot forward conversions to Meta.

Both properties are **omitted, never sent empty**, when the browser has neither cookie nor an ad click to derive from — a visitor who has not yet had `fbevents.js` load and did not arrive from an ad. That is what lets the PostHog destination filter skip an event Meta would certainly refuse, leaving the browser Pixel as the sole record of that conversion.

This requires matching configuration on the PostHog Meta Ads destination, which lives outside this repo:

- map `fbp` to `{event.properties.metaBrowserId}` and `fbc` to `{event.properties.metaClickId}`, replacing the previous `person.properties.fbclid` derivation;
- keep `client_user_agent` and the existing `event_id` mapping;
- filter the destination to events where `metaBrowserId` **or** `metaClickId` is set.

No email, phone, or name is sent to PostHog or Meta. `_fbp` and `_fbc` are still advertising identifiers and belong in any privacy review of this integration.

## Internal traffic opt-out

Clicking the footer dung beetle six times within two seconds toggles the browser's internal-user status. While enabled, the footer displays a localized disabled message (`Internal User: Posthog Disabled` in English), local storage contains `is_internal=true`, and the PostHog client does not start or capture events. Repeating the click sequence removes the flag and resumes capture.

## Custom events

| Event | Fired when | Property | Type | Values / example |
| --- | --- | --- | --- | --- |
| `range_card_clicked` | A home-page Range card is clicked | `rangeSlug` | string | e.g. `feed-mixers` |
| | | `rangeName` | string | e.g. `Feed Mixers` |
| | | `position` | number | 0-based index in the grid |
| `cta_clicked` | A CTA button is clicked | `cta` | string | `hero_contact`, `hero_products`, `bottom_band_contact`, `footer_contact` |
| | | `placement` | string | `hero`, `bottom_band`, `footer` |
| `catalog_filter_changed` | The catalog filter selection changes in-page (not on initial load of a filtered URL) | `range` | string \| null | new Range slug; `null` = cleared via All chip |
| | | `variant` | string \| null | new Variant slug; `null` = no Variant filter |
| | | `previousRange` | string \| null | Range slug before the change |
| | | `previousVariant` | string \| null | Variant slug before the change |
| `product_card_clicked` | A Product card in the catalog grid is clicked | `modelCode` | string | e.g. `JM-2400` |
| | | `position` | number | 0-based index in the visible catalog |
| | | `range` | string \| null | active Range filter slug at click time |
| | | `variant` | string \| null | active Variant filter slug at click time |
| `product_viewed` | Product detail page is viewed (pre-existing event, enriched) | `modelCode` | string | e.g. `JM-2400` |
| | | `range` | string | Range name (pre-existing semantics — keep) |
| | | `variant` | string \| null | Canonical Variant slug; `null` = no Variant |
| | | `metaEventId` | string | UUID shared with Meta Pixel's browser `ViewContent` for Conversions API deduplication |
| | | `metaBrowserId` | string? | `_fbp` cookie value; omitted when absent |
| | | `metaClickId` | string? | `_fbc` cookie value or `fbclid`-derived equivalent; omitted when absent |
| `catalog_viewed` | Product catalog, Range, or Variant-filtered URL is viewed | `range` | string \| null | selected Range slug; `null` = all Ranges |
| | | `variant` | string \| null | selected Variant slug; `null` = all Variants |
| | | `metaEventId` | string | UUID shared with Meta Pixel's browser `ViewContent` for Conversions API deduplication |
| | | `metaBrowserId` | string? | `_fbp` cookie value; omitted when absent |
| | | `metaClickId` | string? | `_fbc` cookie value or `fbclid`-derived equivalent; omitted when absent |
| `product_shared` | A Product is successfully shared through the native share sheet or its link is copied | `modelCode` | string | e.g. `JM-2400` |
| | | `method` | string | `native`, `clipboard` |
| `brochure_downloaded` | Brochure download link clicked on Product detail (pre-existing, unchanged) | `modelCode` | string | e.g. `JM-2400` |
| `contact_form_started` | The visitor first focuses any contact form control, fired once per mount | — | — | no properties — never form content |
| `contact_submitted` | Contact form submitted successfully | `equipment` | string | selected equipment, or the localized "not specified" text |
| | | `metaEventId` | string | UUID shared with Meta Pixel's browser `Lead` for Conversions API deduplication |
| | | `metaBrowserId` | string? | `_fbp` cookie value; omitted when absent |
| | | `metaClickId` | string? | `_fbc` cookie value or `fbclid`-derived equivalent; omitted when absent |
| `contact_submit_blocked` | Contact form submit is stopped because required fields are empty | `missingFields` | string[] | names of the empty required fields, e.g. `["name","message"]` — never field values |
| `contact_submit_failed` | Contact form submission fails | `errorCategory` | string | `network`, `server` — never form content |
| `social_link_clicked` | An outbound social or messaging link is clicked | `platform` | string | `facebook`, `instagram`, `whatsapp` |
| | | `placement` | string | `footer`, `contact_page` |
| `email_linked_clicked` | A `mailto:` link is clicked | `placement` | string | `contact_page` |
| `phone_link_clicked` | A `tel:` link is clicked | `placement` | string | `nav`, `footer`, `contact_page`, `product_detail` |
| `language_switched` | The language switcher is clicked | `fromLocale` | string | `en`, `af` |
| | | `toLocale` | string | `en`, `af` |
| | | `placement` | string | `nav`, `footer` |
