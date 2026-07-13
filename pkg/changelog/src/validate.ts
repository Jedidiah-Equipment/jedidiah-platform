import { type Changelog, Changelog as ChangelogSchema } from '@pkg/schema';

export type ValidationResult = { ok: true; changelog: Changelog } | { ok: false; errors: string[] };

/** Parses JSON, turning a syntax error into a value rather than a throw. Pure. */
export function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `(root): not valid JSON — ${reason}` };
  }
}

/** Gates unknown content against the Changelog schema. Pure. */
export function validateChangelog(raw: unknown): ValidationResult {
  const parsed = ChangelogSchema.safeParse(raw);
  if (parsed.success) return { ok: true, changelog: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => {
      const path = issue.path.join('.') || '(root)';
      return `${path}: ${issue.message}`;
    }),
  };
}

/** Gates a JSON string: a parse failure is a validation failure, not a thrown error. Pure. */
export function validateChangelogJson(text: string): ValidationResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, errors: [parsed.error] };
  return validateChangelog(parsed.value);
}
