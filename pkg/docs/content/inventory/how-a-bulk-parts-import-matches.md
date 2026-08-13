# How a bulk Parts import matches

An import never asks which Parts you meant to change. It works row by row, and each row's **Part
Code** decides which Part that row is about. Understanding that one rule is what makes an
export-edit-import cycle safe.

## Code decides the Part; every other cell decides what it becomes

The **Part Code** is the match key, and it is the only one.

- A row whose Code is already in the catalog **updates** that Part.
- A row whose Code is new **creates** one.
- A row that changes nothing counts as neither, so re-importing an untouched export mostly reports
  zero of both. Expect a handful of updates the first time round: the import title-cases some cells,
  so a Part typed into the app in lower case is corrected on its first trip through a CSV.

Which means editing the **Name** cell renames the Part, exactly as you would expect — and editing the
**Code** cell does not re-code it. The row now describes a Part that does not exist, so the import
creates a second Part under the new Code and leaves the original standing. Change a Part's Code on
the Part itself, not in the CSV.

## Code does not override identity

A Part is its Code plus who supplies it. So a row whose Code already exists **under a different
Supplier** is not re-pointed at the Supplier the row names — it is refused, reported against its line
number, and skipped, while the rest of the file imports.

This is what stops a CSV from quietly moving a Part between Suppliers, and it is also why a typo in
the Supplier cell of an existing Part is an **error rather than a new Supplier**: the row is rejected
before any Supplier is created. A misspelling only creates a stray Supplier when that row's Code is
new as well, because then there is no stored Part for it to contradict.

Suppliers are matched by name, ignoring capitalisation, and the name already on file is the one kept
— importing `acme supplies` against a stored `Acme Supplies` resolves to it and leaves its spelling
alone.

## What the CSV does not carry

The file holds catalog facts only. A Part's Storage Location, its minimum stock, and its perpetual or
periodic setting are not columns in it, and an import leaves them exactly as it found them.

Two catalog facts are only conditionally yours to edit:

- A Part's **Unit** freezes once any stock has moved against it, because changing it would rewrite
  what every past movement counted. A row trying to change a frozen Unit stops the whole import
  rather than skipping one row.
- **Standard Purchase Length** belongs to a Part measured in `mm`, and only to such a Part.

A **Built Part** is made in-house and bought from nobody, so it leaves the Supplier cell blank and
carries `Yes` under Internally Fabricated. It is never measured in `mm`.

Turning a Built Part into a bought one is not something a CSV can do. Such a row has to name a
Supplier, and the Part on file has none, so it reads as a Part under a different Supplier and is
refused by the rule above. That is deliberate: a Built Part is built from a Bill of Materials, and a
Part may have a Supplier or a BOM but never both. Clear the BOM on the Part first if you really mean
to start buying it.

## Text the import tidies

Catagory, Finish, and Name are written back **title-cased**: `bearing housing` becomes
`Bearing Housing`, with technical tokens like `M30`, `SS`, and `UNC` left as they are. This is why a
Part created in the app under a lower-case name changes case the first time it goes through a CSV.

The Supplier cell is tidied the same way for the purpose of finding the Supplier, but a Supplier
already on file keeps its stored spelling — only a Supplier the import has to create takes the name
as the cell tidied it.
