# pdf (@pkg/pdf)

- Keep PDF changes focused on deterministic renderers and small testable helpers.
- Use React-PDF APIs for layout; avoid browser-only APIs.
- Shared brand font assets live in `@pkg/domain/fonts`, with PDF registration in `src/pdf-fonts.ts`.

## Visual QA Flow

- For brochure layout changes, render the committed fixture:
  `pnpm --filter @pkg/pdf render:brochure-fixture`
- The fixture writes `tmp/pdfs/brochure-fixture.pdf` from the repository root. Keep generated PDFs and PNGs under `tmp/pdfs/`; they are intermediate QA artifacts.
- If Poppler is available, render pages to PNGs before judging layout:
  `pdftoppm -png -r 144 tmp/pdfs/brochure-fixture.pdf tmp/pdfs/brochure-fixture`
- Inspect both rendered pages, especially typography, spacing, margins, footer placement, image cropping, and the standard/optional assembly columns.
- If Poppler is unavailable, open `tmp/pdfs/brochure-fixture.pdf` locally and state that PNG rendering was skipped.
- Use real product images when needed without committing them:
  `BROCHURE_HERO_IMAGE=/path/to/hero.jpg BROCHURE_TECHNICAL_IMAGE=/path/to/technical.png BROCHURE_SECONDARY_IMAGE=/path/to/secondary.jpg pnpm --filter @pkg/pdf render:brochure-fixture`
- Remove generated `tmp/pdfs/` artifacts before finishing unless the user asks to keep them.

## Verification

- Run focused renderer tests after PDF changes:
  `pnpm --filter @pkg/pdf test -- src/brochure/brochure-pdf-renderer.test.ts src/quote-document/quote-document-pdf-renderer.test.ts`
- Run `pnpm --filter @pkg/pdf typecheck`.
- For font changes, generate a sample PDF and confirm embedded font names if the change could fall back silently.
