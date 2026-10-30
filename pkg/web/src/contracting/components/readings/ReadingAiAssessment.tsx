import { statusBadgeColorClassNames } from '@pkg/domain';
import { amendmentSettledFinding, assignmentAttentionLevelColorClassNames } from '@pkg/domain/contracting';
import type { HourReading } from '@pkg/schema/contracting';
import { IconChevronRight, IconRefresh } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { fetchMeterPhoto, meterPhotoQueryKey } from '@/contracting/components/MeterPhotoPreview.js';
import { type AssessmentTone, readingAssessment } from '@/contracting/components/ReadingEvidence.js';
import { useReadingReview } from '@/contracting/hooks/use-reading-review.js';
import { cn } from '@/lib/utils.js';

const confidenceSegments = [0, 1, 2, 3, 4];

const toneColors = (colors: { chip: string; text: string; dot: string }) => ({
  badge: `${colors.chip} ${colors.text}`,
  result: colors.text,
  segment: colors.dot,
});

const toneClasses: Record<AssessmentTone, { badge: string; result: string; segment: string }> = {
  success: toneColors(statusBadgeColorClassNames.green),
  notice: toneColors(assignmentAttentionLevelColorClassNames.notice),
  warning: toneColors(assignmentAttentionLevelColorClassNames.warning),
  critical: toneColors(assignmentAttentionLevelColorClassNames.critical),
};

/** The meter photo, fetched with the session, with a button to open it full size. */
export function MeterPhoto({
  reading,
  onExpand,
  className = 'h-56',
}: {
  reading: Pick<HourReading, 'id' | 'role'>;
  onExpand: () => void;
  className?: string;
}) {
  const photoQuery = useQuery({
    queryKey: meterPhotoQueryKey(reading.id),
    queryFn: ({ signal }) => fetchMeterPhoto(reading.id, signal),
    staleTime: Infinity,
  });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photoQuery.data) return;
    const url = URL.createObjectURL(photoQuery.data);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoQuery.data]);

  return (
    <div
      className={cn(
        'relative mt-2 flex items-center justify-center overflow-hidden rounded-lg border bg-muted/30',
        className,
      )}
    >
      {photoQuery.error ? (
        <div className="space-y-2 text-center text-sm">
          <p className="text-destructive">Unable to load meter photo.</p>
          <Button onClick={() => void photoQuery.refetch()} size="sm" variant="outline">
            Try again
          </Button>
        </div>
      ) : photoUrl ? (
        <>
          <img alt={`Hour meter for ${reading.role} reading`} className="h-full w-full object-contain" src={photoUrl} />
          <Button className="absolute right-2 bottom-2" onClick={onExpand} size="sm" variant="outline">
            Expand image
          </Button>
        </>
      ) : (
        <Skeleton className="h-full w-full" />
      )}
    </div>
  );
}

type AssessedReading = Pick<
  HourReading,
  'id' | 'value' | 'aiValue' | 'aiConfidence' | 'aiVerification' | 'aiHint' | 'evidenceReviewedAt' | 'amendedAt'
> & { photoBacked: boolean };

/** What the AI made of a photo-backed reading's meter photo, folded away once an amendment acknowledged it. */
export function ReadingAiAssessment({ reading, canReverify }: { reading: AssessedReading; canReverify: boolean }) {
  const { reverify } = useReadingReview();
  const headingId = useId();
  const evidence = readingAssessment(reading);
  const tone = toneClasses[evidence.tone];
  const settled = amendmentSettledFinding(reading);
  return (
    <Collapsible
      key={`${reading.id}:${settled}`}
      defaultOpen={!settled}
      render={<section aria-labelledby={headingId} className="border-t pt-4" />}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        {settled ? (
          <CollapsibleTrigger
            className="group/ai flex min-w-0 items-center gap-2 text-left"
            render={<button type="button" />}
          >
            <IconChevronRight
              aria-hidden
              className="size-4 shrink-0 transition-transform group-data-[panel-open]/ai:rotate-90"
            />
            <h3 className="text-sm font-semibold" id={headingId}>
              AI assessment of the photo
            </h3>
            <span className="truncate text-xs text-muted-foreground">{evidence.badge} · acknowledged</span>
          </CollapsibleTrigger>
        ) : (
          <h3 className="text-sm font-semibold" id={headingId}>
            AI assessment of the photo
          </h3>
        )}
        {canReverify ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Re-verify photo"
                  disabled={reverify.isPending}
                  onClick={() => reverify.mutate({ id: reading.id })}
                  size="icon-sm"
                  variant="outline"
                />
              }
            >
              <IconRefresh aria-hidden />
            </TooltipTrigger>
            <TooltipContent>Re-verify photo</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <CollapsibleContent>
        <div className="grid gap-5 rounded-lg border bg-muted/50 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(200px,240px)]">
          <div>
            <Badge className={tone.badge} variant="outline">
              {evidence.badge}
            </Badge>
            <h4 className="mt-2 text-base font-semibold">{evidence.title}</h4>
            <p className="mt-1 text-sm text-muted-foreground">{evidence.description}</p>
            {reading.aiHint ? (
              <p className="mt-3 border-l-2 border-warning pl-2.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">AI hint</span> · {reading.aiHint}
              </p>
            ) : null}
            {reading.evidenceReviewedAt ? (
              <p className="mt-3 border-l-2 pl-2.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Review acknowledged</span> · The AI result is retained for
                context.
              </p>
            ) : null}
          </div>
          <div className="border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
            <div className="text-xs font-medium text-muted-foreground">AI result</div>
            <div className={`my-1 text-lg font-semibold ${tone.result}`}>{evidence.result}</div>
            <div className="mt-3 border-t pt-3">
              <div aria-hidden className="mb-2 flex gap-1">
                {confidenceSegments.map((segment) => (
                  <span
                    className={`h-1.5 w-4 rounded-sm ${reading.aiConfidence !== null && segment < Math.max(1, Math.round(reading.aiConfidence * 5)) ? tone.segment : 'bg-foreground/15'}`}
                    key={segment}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">{evidence.confidenceCaption}</span>
            </div>
          </div>
        </div>
      </CollapsibleContent>
      <ErrorMessage error={reverify.error} fallbackMessage="Unable to re-verify reading." />
    </Collapsible>
  );
}
