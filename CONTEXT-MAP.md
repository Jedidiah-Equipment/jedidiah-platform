# Context Map

This platform serves two businesses under one owner, as two bounded contexts (ADR 0016):

- **Jedidiah Equipment** — glossary in [CONTEXT.md](CONTEXT.md) (renames to `CONTEXT-EQUIPMENT.md`
  during the phase-0 symmetric migration).
- **Jedidiah Contracting** — glossary in [CONTEXT-CONTRACTING.md](CONTEXT-CONTRACTING.md).

An unqualified term means the context you are standing in. Crossing contexts, qualify it:
**Equipment Job** / **Contracting Job**. The two contexts deliberately reuse ordinary words (Job,
Customer) for different concepts; never treat a same-named term as shared.

## Shared concepts

- **User** is one person (or Device Account) across both businesses, holding up to two role
  slots — an Equipment role and a Contracting role. **Business access is role presence**: a user
  sees a context's surfaces only while holding a role in it, and only users with both slots
  filled see the mode switcher. **super-admin** is the one role above the split: everything in
  both businesses plus user administration, filling both slots by definition, and still the only
  role that mints another super-admin.
- There is **no data crossing between the two business contexts**: a Contracting Machine holds no
  reference to an Equipment Product Unit (a machine Jedidiah Equipment built is still just a
  Machine on the contracting side), and Customers are not shared — each business keeps its own
  directory, and the same real-world farmer may appear in both.
