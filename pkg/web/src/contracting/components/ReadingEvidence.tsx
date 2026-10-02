import { formatHours, formatPercent } from '@pkg/domain';
import { MISSING_PHOTO_EVIDENCE } from '@pkg/domain/contracting';
import type { JobReading } from '@pkg/schema/contracting';
import { IconInfoCircle } from '@tabler/icons-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

type EvidenceReading = Pick<JobReading, 'photoBacked' | 'value' | 'aiValue' | 'aiConfidence' | 'aiVerification'>;

export type ReadingEvidenceState =
  | { state: 'no-photo' | 'pending' | 'unreadable' }
  | { state: 'low-confidence' | 'disagrees' | 'agrees'; aiValue: number };

/** What the AI made of the meter photo, as `readingVerification` can store it. */
export function readingEvidenceState(reading: Omit<EvidenceReading, 'value'>): ReadingEvidenceState {
  if (!reading.photoBacked) return { state: 'no-photo' };
  if (reading.aiVerification === 'pending') return { state: 'pending' };
  if (reading.aiValue === null) return { state: 'unreadable' };
  if (reading.aiVerification === 'low-confidence') return { state: 'low-confidence', aiValue: reading.aiValue };
  if (reading.aiVerification === 'disagrees') return { state: 'disagrees', aiValue: reading.aiValue };
  return { state: 'agrees', aiValue: reading.aiValue };
}

export type AssessmentTone = 'success' | 'warning' | 'destructive' | 'info' | 'neutral';

/** Each surface's wording for an evidence state. The list and the dialog deliberately differ; do not merge them here. */
const presentation = {
  'no-photo': {
    list: { evidence: MISSING_PHOTO_EVIDENCE, result: () => 'No photo verification' },
    dialog: {
      tone: 'neutral',
      badge: 'No AI result',
      title: 'No photo to analyse',
      description: () => 'The recorded reading has no meter photo, so AI cannot check its value.',
      result: () => 'No analysis',
    },
  },
  pending: {
    list: { evidence: 'Photo-backed · Verification pending', result: () => 'Verification pending' },
    dialog: {
      tone: 'info',
      badge: 'Checking photo',
      title: 'Photo analysis pending',
      description: () => 'The captured photo is available, but AI has not returned a result yet.',
      result: () => 'Waiting for result',
    },
  },
  unreadable: {
    list: { evidence: 'Photo-backed', result: () => 'No readable meter detected' },
    dialog: {
      tone: 'destructive',
      badge: 'Cannot verify from photo',
      title: 'No readable meter found',
      description: (value: number) =>
        `AI could not find a readable hour meter in the photo. This does not confirm the recorded ${formatHours(value)}.`,
      result: () => 'No readable meter',
    },
  },
  'low-confidence': {
    list: { evidence: 'Photo-backed · Low extraction confidence', result: (aiValue: number) => formatHours(aiValue) },
    dialog: {
      tone: 'warning',
      badge: 'Uncertain result',
      title: 'Possible reading, not reliable',
      description: (value: number, aiValue: number) =>
        `AI tentatively read ${formatHours(aiValue)}. The image is too unclear to verify the recorded ${formatHours(value)}.`,
      result: (aiValue: number) => `Possibly ${formatHours(aiValue)}`,
    },
  },
  disagrees: {
    list: { evidence: 'Photo-backed · Extracted value differs', result: (aiValue: number) => formatHours(aiValue) },
    dialog: {
      tone: 'destructive',
      badge: 'Different value found',
      title: 'AI reading differs',
      description: (value: number, aiValue: number) =>
        `AI read ${formatHours(aiValue)} from the photo; the recorded reading is ${formatHours(value)}. Review the photo before amending.`,
      result: (aiValue: number) => formatHours(aiValue),
    },
  },
  agrees: {
    list: { evidence: 'Photo-backed · AI-verified', result: (aiValue: number) => formatHours(aiValue) },
    dialog: {
      tone: 'success',
      badge: 'Same value found',
      title: 'AI reading matches',
      description: (_value: number, aiValue: number) =>
        `AI read ${formatHours(aiValue)} from the photo, matching the recorded reading.`,
      result: (aiValue: number) => formatHours(aiValue),
    },
  },
} satisfies Record<
  ReadingEvidenceState['state'],
  {
    list: { evidence: string; result: (aiValue: number) => string };
    dialog: {
      tone: AssessmentTone;
      badge: string;
      title: string;
      description: (value: number, aiValue: number) => string;
      result: (aiValue: number) => string;
    };
  }
>;

const aiValueOf = (evidence: ReadingEvidenceState) => ('aiValue' in evidence ? evidence.aiValue : Number.NaN);

/** The stint card's and the Reading Exceptions list's reading of the evidence. */
export function readingEvidence(reading: Omit<EvidenceReading, 'value'>) {
  const evidence = readingEvidenceState(reading);
  const { list } = presentation[evidence.state];
  const confidencePercent = reading.aiConfidence === null ? null : Math.round(reading.aiConfidence * 100);
  return {
    confidenceLabel:
      confidencePercent === null
        ? 'Confidence unavailable'
        : reading.aiValue === null
          ? null
          : `${formatPercent(confidencePercent)} confidence in extracted value`,
    evidenceLabel: list.evidence,
    resultLabel: list.result(aiValueOf(evidence)),
    resultConfidencePercent: evidence.state === 'unreadable' ? confidencePercent : null,
  };
}

/** The reading dialog's reading of the evidence. */
export function readingAssessment(reading: EvidenceReading) {
  const evidence = readingEvidenceState(reading);
  const { dialog } = presentation[evidence.state];
  const aiValue = aiValueOf(evidence);
  return {
    tone: dialog.tone as AssessmentTone,
    badge: dialog.badge,
    title: dialog.title,
    description: dialog.description(reading.value, aiValue),
    result: dialog.result(aiValue),
    confidenceCaption: !reading.photoBacked
      ? 'No photo to assess'
      : reading.aiConfidence === null
        ? 'Waiting for AI'
        : reading.aiValue === null
          ? 'Confidence that no readable meter is visible'
          : 'Confidence in the extracted value',
  };
}

/** The stint card's tooltip wording for each served attention kind. */
export const readingAttentionLabels: Record<JobReading['needsALook'][number], string> = {
  disputed: 'disputed',
  'ai-pending': 'AI verification pending',
  'ai-disagrees': 'AI value differs',
  'ai-low-confidence': 'AI confidence low',
  'missing-photo': 'missing photo',
};

export function NoReadableMeterResult({ confidencePercent }: { confidencePercent: number }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex cursor-help items-center gap-1 rounded-sm text-left text-foreground"
          />
        }
      >
        <span>No readable meter detected</span>
        <IconInfoCircle aria-hidden className="size-[18px] shrink-0" />
      </TooltipTrigger>
      <TooltipContent>{formatPercent(confidencePercent)} confident no readable meter was detected</TooltipContent>
    </Tooltip>
  );
}
