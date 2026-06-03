# Create entities in a modal, edit them on an autosaving page

Top-level entities with their own route (**Customer, Product, Supplier, Quote**) follow one standard form pattern: creation happens in a modal dialog holding only the fields required to bring a valid entity into existence, and on success the user is redirected to that entity's edit page, which is a full-field page that **autosaves** with no Save button. This replaces three competing patterns that existed before (page+page, single form page, dialog+dialog) and the previous explicit-save convention.

## Scope

Applies only to top-level entities that have their own list and dedicated route. Nested child entities created in a parent's context (Part under a Supplier, Assembly under a Product) keep their in-context modals for both create and edit and are **out of scope**. Job (no create form — born via Create Job from Quote) and Document (immutable; create + delete only) have no symmetric create/edit and are out of scope.

## Decision

**Create modal**
- Contains only **schema-required** fields (no `.default()`, not `.nullable()`/`.optional()`). The "which fields" decision lives in the create form component, anchored to the create input schema — we did **not** introduce a separate minimal schema. To keep `assemblies` out of the Product modal, `ProductCreateInput.assemblies` now defaults to `[]` (a Product is a catalog shell whose BOM is built on its edit page).
- Has explicit **Save / Cancel** buttons.
- Lives in **local component state** (no create route). The old `*CreatePage` routes are deleted.
- On success: close → toast → navigate to the new entity's edit page.

**Edit page (autosave)**
- No Save button, no edit button. Saves fire **on blur** for text/number fields and **on change** for selects/checkboxes/date-pickers and structural ops (add/remove/reorder/toggle in nested editors like Product `assemblies` and Quote `selectedAssemblies`). The form is **flushed on navigate-away**.
- Payload stays **whole-entity replace** (existing `*UpdateInput`); a save is gated on **whole-form validity** — an invalid field shows an inline error and pauses autosave until fixed. Persisted state is therefore always a valid snapshot.
- Feedback is a single page-level `Saving… → Saved` status indicator (no success toasts). Failures get a persistent toast + inline error, keep the user's typed value (never revert), and offer Retry; leaving with failed/invalid unsaved changes triggers a router leave-guard.
- Partial-frozen entities (Locked Quote, per ADR 0027): frozen fields render read-only and have no save trigger; nothing in the autosave layer is lock-aware.

**Shared abstractions**: a `<CreateEntityDialog>` shell and a `useAutosaveForm` hook (+ `<AutosaveStatus>`) carry the behavior; each entity supplies only its field definitions and mutations, so the four pages cannot drift.

## Consequences

- **Last-writer-wins** on concurrent edits. Whole-entity replace plus autosave means two simultaneous editors silently clobber each other. Accepted for now given a small team; optimistic-concurrency (version/`updatedAt` checks) is a future slice touching every update contract.
- A lingering invalid field pauses autosave of *other* valid edits on the same form, because the payload is whole-entity. Accepted as intuitive given inline errors.
- Fields that were optional-at-creation in the old full create forms now require one extra step (create → land on edit page → fill them in).
