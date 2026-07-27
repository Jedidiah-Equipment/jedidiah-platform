# pdf (@pkg/pdf)

- Keep PDF changes focused on deterministic renderers and small testable helpers.
- Use React-PDF APIs for layout; avoid browser-only APIs.
- Shared brand font assets live in `@pkg/domain/fonts`, with PDF registration in `src/pdf-fonts.ts`. After a
  font change, generate a sample PDF and confirm the embedded font names — fallback is silent.
- Keep this package's `react` dependency aligned with `@pkg/mobile`. Expo Doctor scans the whole monorepo
  and fails on duplicate React installs even though this package is server-side.

## Visual QA

For brochure layout changes, render the committed fixture and look at it — the tests do not catch layout:

```sh
pnpm --filter @pkg/pdf render:brochure-fixture
pdftoppm -png -r 144 tmp/pdfs/brochure-fixture.pdf tmp/pdfs/brochure-fixture   # if Poppler is available
```

- Output goes to `tmp/pdfs/` at the repository root. Remove those artifacts before finishing unless asked
  to keep them. If Poppler is unavailable, open the PDF and say that PNG rendering was skipped.
- Inspect every page for typography, spacing, margins, footer placement, image cropping, and the
  standard/optional assembly columns.
- `BROCHURE_FIXTURE_VARIANT=sparse|reference|dense` varies key-feature, assembly, and description sizes;
  `BROCHURE_FIXTURE_LOCALE=en|af` picks the localized variant.
- `BROCHURE_HERO_IMAGE` / `BROCHURE_TECHNICAL_IMAGE` / `BROCHURE_SECONDARY_IMAGE` point the fixture at real
  product images without committing them.

Then run the focused renderer tests:

```sh
pnpm --filter @pkg/pdf test -- src/brochure/brochure-pdf-renderer.test.ts src/quote-document/quote-document-pdf-renderer.test.ts
```
