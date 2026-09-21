import type { JobReading } from '@pkg/schema/contracting';
import { IconInfoCircle } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

type EvidenceReading = Pick<
  JobReading,
  'photoBacked' | 'aiValue' | 'aiConfidence' | 'aiVerification' | 'disputed' | 'disputeReason' | 'aiHint'
>;

const aiVerificationPresentation: Record<
  EvidenceReading['aiVerification'],
  { evidenceLabel: string; resultLabel?: string }
> = {
  agrees: { evidenceLabel: 'AI-verified' },
  pending: { evidenceLabel: 'Verification pending', resultLabel: 'Verification pending' },
  disagrees: { evidenceLabel: 'Extracted value differs' },
  'low-confidence': { evidenceLabel: 'Low extraction confidence' },
  'not-applicable': { evidenceLabel: 'Photo verification not applicable', resultLabel: 'No photo verification' },
};

export function readingEvidence(reading: EvidenceReading) {
  const verification = aiVerificationPresentation[reading.aiVerification];
  const noReadableMeter = verification.resultLabel === undefined && reading.aiValue === null;
  const confidencePercent = reading.aiConfidence === null ? null : Math.round(reading.aiConfidence * 100);
  const evidenceDetail =
    noReadableMeter && reading.aiVerification === 'low-confidence' ? null : verification.evidenceLabel;
  return {
    confidenceLabel:
      confidencePercent === null
        ? 'Confidence unavailable'
        : reading.aiValue === null
          ? null
          : `${confidencePercent}% confidence in extracted value`,
    evidenceLabel: reading.photoBacked
      ? ['Photo-backed', evidenceDetail].filter(Boolean).join(' · ')
      : 'Missing Photo Evidence',
    resultLabel:
      verification.resultLabel ??
      (reading.aiValue === null ? 'No readable meter detected' : `${reading.aiValue.toFixed(1)} h`),
    resultConfidencePercent: noReadableMeter ? confidencePercent : null,
    tone: (!reading.photoBacked
      ? 'muted'
      : reading.disputed || reading.aiVerification === 'disagrees' || reading.aiVerification === 'low-confidence'
        ? 'warn'
        : 'ok') as 'muted' | 'warn' | 'ok',
  };
}

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
      <TooltipContent>{confidencePercent}% confident no readable meter was detected</TooltipContent>
    </Tooltip>
  );
}

export function ReadingEvidenceBadge({ reading, onPreview }: { reading: JobReading; onPreview?: () => void }) {
  const presentation = readingEvidence(reading);
  const label = !reading.photoBacked
    ? 'No photo'
    : reading.disputed || reading.aiVerification === 'disagrees'
      ? 'AI differs'
      : reading.aiVerification === 'pending'
        ? 'Pending'
        : reading.aiConfidence !== null
          ? `✓ ${Math.round(reading.aiConfidence * 100)}%`
          : presentation.evidenceLabel;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" onClick={onPreview} disabled={!onPreview} className="cursor-help" />}
      >
        <Badge variant="outline">{label}</Badge>
      </TooltipTrigger>
      <TooltipContent>
        {presentation.evidenceLabel} · {presentation.resultLabel}
        {presentation.confidenceLabel ? ` · ${presentation.confidenceLabel}` : ''}
      </TooltipContent>
    </Tooltip>
  );
}
