/**
 * Use this for fields that are created by a structural form action and may be invalid
 * the moment they appear. Examples are "Add assembly" creating an empty `name`, or
 * "Add part" creating an empty required selection.
 *
 * Autosave edit forms validate the whole form after structural changes, but that
 * validation can run before a newly inserted array child field has fully mounted.
 * In that case the autosave banner correctly reports an invalid form while the
 * input itself has no field-owned error meta yet. The user then only sees the
 * field error after focusing and blurring the input, which makes the UI look
 * inconsistent.
 *
 * Field-level `onMount` validation runs through TanStack Form's normal field
 * lifecycle after the field instance exists. That keeps the visible error attached
 * to the input and avoids brittle workarounds like synthetic blur events, delayed
 * revalidation, or component-local schema parsing.
 *
 * Always pass the schema-owned scalar for the field rule. This keeps field
 * constraints centralized in `@pkg/schema` while still allowing structural UI
 * rows to surface their initial invalid state immediately.
 */
export function validateStructuralFieldOnMount<TValidator>(validator: TValidator) {
  return { onMount: validator } as const;
}
