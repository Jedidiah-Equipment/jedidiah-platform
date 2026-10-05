# Domain docs

This repo has two bounded contexts under ADR 0016. `GLOSSARY-MAP.md` at the root
points at one glossary per business. There is no root `GLOSSARY.md` and none should be created: a skill's
reference to `GLOSSARY.md` means the relevant business glossary below. Update these canonical files
when resolving vocabulary or invariants.

## Read for the area being changed

- `GLOSSARY-MAP.md`: context boundaries, shared concepts, collision rules, and glossary locations.
- `GLOSSARY-EQUIPMENT.md`: Equipment vocabulary and invariants.
- `GLOSSARY-CONTRACTING.md`: Contracting vocabulary and invariants.
- `docs/adr/`: architectural decisions for both businesses and shared infrastructure.

Search the map, relevant glossary, and ADRs for the concept first, then read the matching sections
and decisions. Follow the map if a glossary location changes. Packages and layers are code boundaries;
the business contexts determine which vocabulary applies.

## Use the defined vocabulary

Use the glossary's terms in issues, tests, and planning. An unqualified term belongs to the context
being worked in; across contexts, say **Equipment Job** or **Contracting Job**, for example.
Same-named concepts in the two businesses are independent unless the map defines them as shared.

If a needed term is missing, flag the gap rather than inventing local vocabulary. Record resolved
terms in the relevant existing glossary and shared concepts or collision rules in the map.

## Respect decisions

If a recommendation conflicts with an ADR, identify that conflict explicitly. Record a new or revised
architectural decision in `docs/adr/` when it is resolved. Preserve the consumer rule from ADR 0004:
the glossaries are for human readers and must not be scraped wholesale into runtime prompts.
