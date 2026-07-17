# Lander Analytics Contract

This file is the reporting contract for the Lander's typed analytics registry. Update it in the same PR as any registry change.

## Every event and pageview

The active Locale is registered as a PostHog super property and is also set as a person property via `$set`.

| Property | Type | Values |
| --- | --- | --- |
| `language` | string | `en`, `af` — the Locale the visitor is browsing in |

## Pageviews

`$pageview` is PostHog's built-in event, fired on initial load and on SPA navigations (`history_change`). It has no custom properties beyond PostHog defaults and `language`.

## Custom events

| Event | Fired when | Property | Type | Values / example |
| --- | --- | --- | --- | --- |
| `range_card_clicked` | A home-page Range card is clicked | `rangeSlug` | string | e.g. `feed-mixers` |
| | | `rangeName` | string | e.g. `Feed Mixers` |
| | | `position` | number | 0-based index in the grid |
| `cta_clicked` | A home-page CTA button is clicked | `cta` | string | `hero_contact`, `hero_products`, `bottom_band_contact` |
| | | `placement` | string | `hero`, `bottom_band` |
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
| `product_shared` | A Product is successfully shared through the native share sheet or its link is copied | `modelCode` | string | e.g. `JM-2400` |
| | | `method` | string | `native`, `clipboard` |
| `brochure_downloaded` | Brochure download link clicked on Product detail (pre-existing, unchanged) | `modelCode` | string | e.g. `JM-2400` |
| `contact_submitted` | Contact form submitted successfully (pre-existing, unchanged) | `equipment` | string | selected equipment, or the localized "not specified" text |
| `contact_submit_failed` | Contact form submission fails | `errorCategory` | string | `network`, `server` — never form content |
| `social_link_clicked` | An outbound social or messaging link is clicked | `platform` | string | `instagram`, `whatsapp` |
| | | `placement` | string | `footer`, `contact_page` |
| `phone_link_clicked` | A `tel:` link is clicked | `placement` | string | `nav`, `footer`, `contact_page`, `product_detail` |
| `language_switched` | The language switcher is clicked | `fromLocale` | string | `en`, `af` |
| | | `toLocale` | string | `en`, `af` |
| | | `placement` | string | `nav`, `footer` |
