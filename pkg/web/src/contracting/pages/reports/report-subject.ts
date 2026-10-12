import { UUID } from '@pkg/schema';
import type { UtilisationTrendSubject } from '@pkg/schema/contracting';

/** Reads `category:<uuid>` / `machine:<uuid>` from the URL; anything else is the fleet. */
export function parseReportSubject(value: string | undefined): UtilisationTrendSubject {
  const [kind, id] = (value ?? '').split(':');
  const parsed = UUID.safeParse(id);
  if ((kind === 'category' || kind === 'machine') && parsed.success) return { kind, id: parsed.data };
  return { kind: 'fleet' };
}

/** The URL form of a subject; the fleet has none. */
export function formatReportSubject(subject: UtilisationTrendSubject): string | undefined {
  return subject.kind === 'fleet' ? undefined : `${subject.kind}:${subject.id}`;
}
