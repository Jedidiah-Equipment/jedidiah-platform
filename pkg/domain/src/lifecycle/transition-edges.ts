/**
 * Builds a lifecycle's edges. Each edge is one move: the statuses it leaves and the columns that travel with it,
 * including the ones the database requires cleared. It judges no one: the caller has already asserted the action, so
 * a move with no edge from the subject's status is a programming error, not a refusal.
 */
export const transitionEdges =
  <Status extends string, Subject extends { status: Status }>(noun: string, statusLabels: Record<Status, string>) =>
  <Event, Columns extends { readonly status: Status }>(
    verb: string,
    from: readonly Status[],
    columns: (event: Event, subject: Subject) => Columns,
  ) =>
  (subject: Subject, event: Event): Columns => {
    if (!from.includes(subject.status))
      throw new Error(`Cannot ${verb} a ${noun} that is ${statusLabels[subject.status]}.`);
    return columns(event, subject);
  };
