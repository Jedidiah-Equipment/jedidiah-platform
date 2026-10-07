import type { BreakdownSubjectRef, BreakdownUrgency } from '@pkg/schema/contracting';
import { BREAKDOWN_MAX_PHOTOS, BreakdownDescription } from '@pkg/schema/contracting';

export type ReportDraft = {
  subject: BreakdownSubjectRef | null;
  urgency: BreakdownUrgency | null;
  description: string;
  photoCount: number;
};

/** What the report form may do now, and the one message under each field that is not ready. */
export function deriveReport(
  draft: ReportDraft,
  { canReport, busy }: { canReport: boolean; busy: boolean },
): { canSend: boolean; photosLeft: number; messages: Partial<Record<'subject' | 'urgency' | 'description', string>> } {
  const description = BreakdownDescription.safeParse(draft.description);
  const messages: Partial<Record<'subject' | 'urgency' | 'description', string>> = {};
  if (!draft.subject) messages.subject = 'Choose the Machine or Implement.';
  if (!draft.urgency) messages.urgency = 'Choose Code Red or Code Green.';
  if (!description.success) messages.description = description.error.issues[0]?.message ?? 'Describe the problem';
  return {
    canSend: canReport && !busy && Object.keys(messages).length === 0 && draft.photoCount <= BREAKDOWN_MAX_PHOTOS,
    photosLeft: Math.max(0, BREAKDOWN_MAX_PHOTOS - draft.photoCount),
    messages,
  };
}
