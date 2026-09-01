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
- There is **no data crossing between the two business contexts**: a Contracting Machine holds no
  reference to an Equipment Product Unit (a machine Jedidiah Equipment built is still just a
  Machine on the contracting side), and Customers are not shared — each business keeps its own
  directory, and the same real-world farmer may appear in both.
