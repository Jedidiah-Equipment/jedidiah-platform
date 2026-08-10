export function flushAfterFormStateCommit(flush: () => void): void {
  // TanStack Form commits a field's blur update at the end of the React event turn.
  // Flushing synchronously here would read the value from immediately before the edit.
  queueMicrotask(flush);
}
