import { BUSINESSES, type Business, type Changelog, Changelog as ChangelogSchema } from '@pkg/schema';

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

/** The business a changelog path's parent directory names, or none when it sits elsewhere. */
export function businessFromDirectoryName(directoryName: string): Business | undefined {
  return (BUSINESSES as readonly string[]).includes(directoryName) ? (directoryName as Business) : undefined;
}

export interface ValidateOptions {
  /** The business the file's location claims; the file's own `business` must agree. */
  business?: Business | undefined;
}

/** Gates unknown content against the Changelog schema. Pure. */
export function validateChangelog(raw: unknown, options: ValidateOptions = {}): ValidationResult {
  const parsed = ChangelogSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const path = issue.path.join('.') || '(root)';
        return `${path}: ${issue.message}`;
      }),
    };
  }
  if (options.business && parsed.data.business !== options.business) {
    return {
      ok: false,
      errors: [`business: expected '${options.business}' from the directory, found '${parsed.data.business}'`],
    };
  }
  return { ok: true, changelog: parsed.data };
}

/** Gates a JSON string: a parse failure is a validation failure, not a thrown error. Pure. */
export function validateChangelogJson(text: string, options: ValidateOptions = {}): ValidationResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, errors: [parsed.error] };
  return validateChangelog(parsed.value, options);
}
