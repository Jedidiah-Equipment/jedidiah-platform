# Context Map

This platform serves two businesses under one owner, as two bounded contexts (ADR 0016):

- **Jedidiah Equipment** — glossary in [CONTEXT.md](CONTEXT.md) (renames to `CONTEXT-EQUIPMENT.md`
  during the phase-0 symmetric migration).
- **Jedidiah Contracting** — glossary in [CONTEXT-CONTRACTING.md](CONTEXT-CONTRACTING.md).

An unqualified term means the context you are standing in. Crossing contexts, qualify it:
**Equipment Job** / **Contracting Job**. The two contexts deliberately reuse ordinary words (Job,
Customer) for different concepts; never treat a same-named term as shared.

## Shared concepts

- **User** is one person (or Device Account) across both businesses. A user's **business access**
  — Equipment, Contracting, or both — decides which context's surfaces they see; only both-access
  users see the mode switcher. App Roles remain one flat set spanning both contexts.
- **Machine ↔ Product Unit link**: a Contracting Machine that Jedidiah Equipment built may
  reference its Product Unit. Most of the contracting fleet is bought, not built, and references
  nothing. This is the only deliberate data crossing between the two business contexts.
- Customers are **not** shared: each business keeps its own directory, and the same real-world
  farmer may appear in both.
