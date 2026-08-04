# docs (@pkg/docs)

- VitePress site of user-facing documentation, public but unindexed (`noindex` head plus a disallow-all
  `robots.txt`). It is read mid-task, often from a shared tablet with no session. Nothing too sensitive to
  publish belongs here; it belongs in the app, near the data.
- Markdown pages live in `content/`; the site config and its tests live in `src/`. `.vitepress/config.ts`
  only re-exports `src/config.ts`.
- The dev server sits outside the parallel slot port scheme. It lands on 5173 and steps to the next free
  port rather than failing, so two checkouts can preview at once; `pnpm --filter @pkg/docs dev` also honours
  `PORT`, which `pnpm dev` does not pass through (turbo runs in strict env mode).
- The sidebar is computed once when the config loads, so a newly written page shows up in a running dev
  server only after VitePress restarts on a config change.
- `src/help-topics.test.ts` walks `HELP_TOPICS` from `@pkg/domain` and fails when a topic names a page this
  site does not have. Renaming or moving a page means repointing its registry entry in the same PR.
- Navigation comes from `DOCS_SECTIONS` in `src/sidebar.ts` filtered to the pages that exist. Declare a page
  there before writing it if you like — it stays hidden until the file lands. Never ship a "coming soon"
  stub, and never leave a written page out of `DOCS_SECTIONS`; a test fails on the orphan.

## Content rules

- **Two page types, and they do not blend.** A **task page** is the numbered steps for one thing a user
  does (Post a Receipt, Run a stocktake session) and explains theory in at most one linking sentence. A
  **concept page** explains one idea (why a warning is a judgment and not a block, perpetual versus
  periodic) and contains no steps.
- **Vocabulary is `CONTEXT.md`'s, verbatim**, and matches what the UI says: Checkout, Receipt, Return to
  Store, Part. Never a synonym, never a second definition — these pages are the user-facing projection of
  `CONTEXT.md`, not a competing glossary. If the right word is missing there, say so rather than coining one.
- **Screenshot budget is zero by default.** Each image has to justify itself (what a Part Label looks like)
  and is cropped tight so incidental UI churn does not invalidate it. Numbered steps name the exact UI label
  instead of pointing at a picture.
- **No screen-by-screen, field-by-field reference section.** It is the fastest thing to write, the fastest
  to rot, and nobody reads it mid-task.
- **Docs trail landed features.** Document a workflow once it has shipped; unlanded work brings its own
  docs in its own PR.
