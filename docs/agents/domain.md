# Domain Docs

This repo uses a single-context domain docs layout for engineering skills.

## Before Exploring

Read these files when they exist and are relevant to the task:

- `CONTEXT.md` at the repo root for domain language and glossary.
- `docs/adr/` for architectural decisions that touch the area under change.

If these files do not exist, proceed silently. Do not flag their absence or suggest creating them
upfront. The documentation-producing skills can create them lazily when terms or decisions are
actually resolved.

## Consumer Rules

- Use the domain terms from `CONTEXT.md` in issue titles, refactor proposals, hypotheses, and tests.
- If a needed concept is missing from the glossary, note the gap for `grill-with-docs`.
- If a recommendation contradicts an ADR, call out the conflict explicitly.
- Treat `docs/research` as non-authoritative unless the user explicitly asks to use it.
