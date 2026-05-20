# Three distinct page layout components enforce structural consistency

New pages must use one of three layout components: `ListPageLayout`, `DetailPageLayout`, or `EditPageLayout`. Each component bakes in the Card wrapper, spacing, and scrolling behaviour for its page type so consistency is structural rather than copy-paste discipline.

## Context

All existing List, Detail, and Edit pages share the same outer wrapper (`flex flex-1 flex-col gap-4 p-4 pt-0`) and wrap their content in a `<Card>`. This consistency holds today only because developers have copied the pattern — there is no component enforcing it. The three page types have meaningfully different structures, so a single generic layout component would require too many optional flags.

## Decision

**`ListPageLayout`** — full-width, non-sticky header.
Slots: `title`, `description`, `action` (primary button), `children` (table content).

**`DetailPageLayout`** — full-width, non-sticky header with back button. Optional `aside` slot rendered as a sticky right column at `xl` breakpoint (fixed `22rem` width). When `aside` is omitted the layout is single-column.
Slots: `title`, `description`, `back` (rendered ReactNode — use `BackButton`), `badge`, `aside`, `children`.

**`EditPageLayout`** — non-sticky header with back button, form content constrained to `max-w-2xl` and centered.
Slots: `title`, `description`, `back` (rendered ReactNode — use `BackButton`), `badge`, `children`.

The `<Card>` wrapper is baked into each component. Pages pass content as children and cannot omit or rewrap it.

Page headers are non-sticky across all three types. The `DataTable` component already manages its own sticky column headers; adding a sticky page header would require coordinated `top` offsets between the two and is not worth the complexity.

## Consequences

- Every new page inherits correct layout by construction — there is nothing to copy.
- The sticky aside pattern (currently only `JobDetailPage`) is promoted to a first-class capability of `DetailPageLayout` rather than a one-off.
- `EditPageLayout` constrains form width to `max-w-2xl`; forms should not stretch to full viewport width on large screens.
- Existing pages should be migrated to use these components to eliminate the copy-pasted wrapper divs.
