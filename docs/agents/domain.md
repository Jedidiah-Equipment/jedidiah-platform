# Domain Docs

This repo uses compact current-state domain docs for engineering guidance.

## Loading Rule

- Search `CONTEXT.md` first for domain names and invariants.
- Read only the relevant section of `CONTEXT.md`; do not load it wholesale unless the task is domain planning.
- Read only the `docs/adr/` file that touches the work area.
- Treat `docs/research` as non-authoritative unless the user explicitly asks to use it.

## Consumer Rules

- Use `CONTEXT.md` terms in issue titles, refactor proposals, tests, and user-facing planning.
- If a recommendation conflicts with a compact ADR, call out the conflict explicitly.
- If a needed term or decision is missing, note the gap for a docs/planning pass instead of inventing a new local vocabulary.
