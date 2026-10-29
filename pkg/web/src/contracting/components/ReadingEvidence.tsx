import { formatHours, formatPercent } from '@pkg/domain';
import {
  assignmentAttentionKindLevels,
  type ReadingEvidenceState,
  readingEvidenceLabels,
  readingEvidenceState,
} from '@pkg/domain/contracting';
import type { AssignmentAttentionLevel, JobReading, JobReadingAttentionKind } from '@pkg/schema/contracting';
import { IconInfoCircle } from '@tabler/icons-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

type EvidenceReading = Pick<JobReading, 'photoBacked' | 'value' | 'aiValue' | 'aiConfidence' | 'aiVerification'>;

/** A reading assessment's tone: its attention kind's level, or success when the AI confirmed the value. */
export type AssessmentTone = AssignmentAttentionLevel | 'success';

/**
 * Each surface's wording for an evidence state beyond the list's evidence label, which domain owns. The list and the
 * dialog deliberately differ; do not merge them here.
 */
const presentation = {
  'no-photo': {
    listResult: () => 'No photo verification',
    dialog: {
      kind: 'missing-photo',
      badge: 'No AI result',
      title: 'No photo to analyse',
      description: () => 'The recorded reading has no meter photo, so AI cannot check its value.',
      result: () => 'No analysis',
    },
  },
  pending: {
    listResult: () => 'Verification pending',
    dialog: {
      kind: 'ai-pending',
      badge: 'Checking photo',
      title: 'Photo analysis pending',
      description: () => 'The captured photo is available, but AI has not returned a result yet.',
      result: () => 'Waiting for result',
    },
  },
  unreadable: {
    listResult: () => 'No readable meter detected',
    dialog: {
      kind: 'ai-low-confidence',
      badge: 'Cannot verify from photo',
      title: 'No readable meter found',
      description: (value: number) =>
        `AI could not find a readable hour meter in the photo. This does not confirm the recorded ${formatHours(value)}.`,
      result: () => 'No readable meter',
    },
  },
  'low-confidence': {
    listResult: (aiValue: number) => formatHours(aiValue),
    dialog: {
      kind: 'ai-low-confidence',
      badge: 'Uncertain result',
      title: 'Possible reading, not reliable',
      description: (value: number, aiValue: number) =>
        `AI tentatively read ${formatHours(aiValue)}. The image is too unclear to verify the recorded ${formatHours(value)}.`,
      result: (aiValue: number) => `Possibly ${formatHours(aiValue)}`,
    },
  },
  disagrees: {
    listResult: (aiValue: number) => formatHours(aiValue),
    dialog: {
      kind: 'ai-disagrees',
      badge: 'Different value found',
      title: 'AI reading differs',
      description: (value: number, aiValue: number) =>
        `AI read ${formatHours(aiValue)} from the photo; the recorded reading is ${formatHours(value)}. Review the photo before amending.`,
      result: (aiValue: number) => formatHours(aiValue),
    },
  },
  agrees: {
    listResult: (aiValue: number) => formatHours(aiValue),
    dialog: {
      kind: null,
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
    listResult: (aiValue: number) => string;
    dialog: {
      /** The attention kind this evidence state raises; null when the AI confirmed the value. */
      kind: JobReadingAttentionKind | null;
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
  const { listResult } = presentation[evidence.state];
  const confidencePercent = reading.aiConfidence === null ? null : Math.round(reading.aiConfidence * 100);
  return {
    confidenceLabel:
      confidencePercent === null
        ? 'Confidence unavailable'
        : reading.aiValue === null
          ? null
          : `${formatPercent(confidencePercent)} confidence in extracted value`,
    evidenceLabel: readingEvidenceLabels[evidence.state],
    resultLabel: listResult(aiValueOf(evidence)),
    resultConfidencePercent: evidence.state === 'unreadable' ? confidencePercent : null,
  };
}

/** The reading dialog's reading of the evidence. */
export function readingAssessment(reading: EvidenceReading) {
  const evidence = readingEvidenceState(reading);
  const { dialog } = presentation[evidence.state];
  const aiValue = aiValueOf(evidence);
  return {
    tone: dialog.kind ? assignmentAttentionKindLevels[dialog.kind] : ('success' as const),
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

/** The AI meter result when no readable meter was found, with its confidence on hover. */
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
