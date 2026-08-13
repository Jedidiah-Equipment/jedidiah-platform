import type { FormIssue } from '@pkg/domain';
import React from 'react';

const AutosaveIssuesContext = React.createContext<readonly FormIssue[]>([]);

/**
 * Publishes the autosave flush's blocking issues to the editors below it.
 *
 * Editors normally read errors from field meta, but a cross-field rule (a duplicate part within an
 * assembly, say) has no single owning field, and TanStack does not keep such an error on rows of an
 * array nested inside another array. Reading the flush result instead keeps every row's highlight
 * agreeing with the banner, which is what "fix the highlighted fields" promises.
 */
export const AutosaveIssuesProvider: React.FC<{ children: React.ReactNode; issues: readonly FormIssue[] }> = ({
  children,
  issues,
}) => {
  return <AutosaveIssuesContext.Provider value={issues}>{children}</AutosaveIssuesContext.Provider>;
};

export function useAutosaveIssues(): readonly FormIssue[] {
  return React.useContext(AutosaveIssuesContext);
}
