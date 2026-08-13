/**
 * One blocking validation problem, addressed at the form field that owns it.
 *
 * `path` is the field name a form library addresses a field by (`assemblies[6].parts[3].partId`),
 * so a surface can match an issue to the row it belongs to without re-deriving the shape.
 */
export type FormIssue = {
  message: string;
  path: string;
};

/** The shape every Standard Schema issue already has; avoids a Zod dependency here. */
type SchemaIssue = {
  message: string;
  path?: readonly PropertyKey[] | undefined;
};

export function toFormIssues(issues: readonly SchemaIssue[]): FormIssue[] {
  return issues.map((issue) => ({ message: issue.message, path: toFormIssueFieldName(issue.path ?? []) }));
}

/**
 * Joins a schema issue path into a form field name. A numeric segment is an array index, which is
 * how every form value in this codebase is shaped — none of them key an object by a number.
 */
export function toFormIssueFieldName(path: readonly PropertyKey[]): string {
  return path.reduce<string>((name, segment) => {
    const key = String(segment);

    if (/^\d+$/.test(key)) {
      return `${name}[${key}]`;
    }

    return name ? `${name}.${key}` : key;
  }, '');
}

/** Distinct messages in first-seen order: the same rule breaking on two rows reads as one problem. */
export function getFormIssueMessages(issues: readonly FormIssue[]): string[] {
  return [...new Set(issues.map((issue) => issue.message))];
}

/**
 * Whether any issue sits at or below `prefix`. A match must continue with a path separator, so
 * `assemblies[6]` covers `assemblies[6].name` but not `assemblies[60].name`, and a prefix naming an
 * array (`assemblies`) still covers `assemblies[6].name`.
 */
export function hasFormIssuesWithin(issues: readonly FormIssue[], prefix: string): boolean {
  return issues.some(
    (issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`) || issue.path.startsWith(`${prefix}[`),
  );
}

export function getFormIssuesForField(issues: readonly FormIssue[], fieldName: string): FormIssue[] {
  return issues.filter((issue) => issue.path === fieldName);
}
