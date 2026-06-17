# Generated Product Brochure

The product Brochure is generated from structured, Product-owned Brochure Config and rendered from scratch with `@react-pdf/renderer`, rather than uploaded as a designed PDF. We chose this so the customer-facing marketing PDF stays in sync with live product data (name, assemblies, description) and is themed/versioned in code, accepting that we rebuild the layout ourselves.

## Considered Options

- **Upload a designed PDF (status quo).** Rejected: the brochure drifts from product data, can't be regenerated, and every catalog change is a manual re-export.
- **Fill a fixed template PDF.** Rejected: the key-features and assembly lists are variable-length, and a fixed-geometry template overflows or clips rather than reflowing.
- **Render from scratch (chosen).** Reuses the existing react-pdf renderer, theme, and pdf-lib merge tooling; reflows variable-length content natively.

## Consequences

- The layout is reproduced in code (brand-consistent to the Jedidiah PDF theme, not pixel-faithful to any one sample); visual changes are code changes.
- Generation always reads live config: a Brochure is streamed unsaved on the Product screen, merged into the Quote Document packet at Quote generation, and saved as an immutable standalone Job Document at Job creation. Saved Brochures reflect config as of their generation moment.
- A completeness gate (all config fields + non-empty description + at least one assembly) governs availability; below it the Brochure is skipped with a `brochure_config_incomplete` warning.
- Done pre-launch as a hard cutover: `brochure` is removed from the uploadable document types, with no migration or fallback to uploaded brochures.
