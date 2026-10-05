import { formatHours, statusBadgeColorClassNames } from '@pkg/domain';
import { assignmentAttentionLevelColorClassNames } from '@pkg/domain/contracting';
import type { JobReading } from '@pkg/schema/contracting';
import { IconAlertTriangle, IconChevronRight, IconPencil, IconRefresh } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { type MachineDialogSubject, MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { fetchMeterPhoto, MeterPhotoPreview, meterPhotoQueryKey } from '@/contracting/components/MeterPhotoPreview.js';
import { type AssessmentTone, readingAssessment } from '@/contracting/components/ReadingEvidence.js';
import { useReadingReview } from '@/contracting/hooks/use-reading-review.js';

import { ReadingAmendDialog } from './ReadingAmendDialog.js';

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

/** Everything the reading dialog shows about one Hour Reading, from a Job sheet or the Reading Exceptions list. */
export type DialogReading = Omit<JobReading, 'attention'>;

function MeterPhoto({ reading, onExpand }: { reading: DialogReading; onExpand: () => void }) {
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
    <div className="relative mt-2 flex h-56 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
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

export function ReadingDialog({
  selected,
  onClose,
  amendReadings,
  amendDescription,
}: {
  selected: { reading: DialogReading; machine: MachineDialogSubject } | null;
  onClose: () => void;
  amendReadings: boolean;
  /** Replaces the amend step's default description. */
  amendDescription?: React.ReactNode;
}) {
  const [amending, setAmending] = useState(false);
  const [preview, setPreview] = useState(false);
  const { amend, reverify } = useReadingReview();
  const reading = selected?.reading;
  const evidence = reading ? readingAssessment(reading) : null;
  const tone = evidence ? toneClasses[evidence.tone] : toneClasses.notice;
  const close = () => {
    setAmending(false);
    setPreview(false);
    onClose();
  };
  const startAmending = () => {
    amend.reset();
    setAmending(true);
  };
  // An amendment that acknowledged the current AI finding is the latest word on the reading; a re-verify reopens it.
  const amendmentSettledFinding = !!reading?.amendedAt && !!reading.evidenceReviewedAt;

  return (
    <>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="sm:max-w-[780px]">
          <DialogHeader>
            <DialogTitle>
              <MachineDialogTitle machine={selected?.machine ?? null}>{reading?.role ?? 'Reading'}</MachineDialogTitle>
            </DialogTitle>
            <DialogDescription>Hours and gaps recompute from the amended value.</DialogDescription>
          </DialogHeader>
          {reading ? (
            <>
              <div className="space-y-4">
                <section aria-labelledby="recorded-reading-heading">
                  <h3 className="mb-3 text-sm font-semibold" id="recorded-reading-heading">
                    Recorded reading
                  </h3>
                  <div className="grid gap-5 sm:grid-cols-[minmax(185px,0.8fr)_minmax(0,1.2fr)]">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">Hour meter value</div>
                      <div className="my-1 text-4xl font-semibold tracking-tight">{formatHours(reading.value)}</div>
                      <div className="text-sm text-muted-foreground">
                        Captured <DateDisplay date={reading.capturedAt} format="medium" />
                        <br />
                        by <span className="font-medium text-foreground">{reading.capturedByName ?? 'Unknown'}</span>
                      </div>
                      {reading.comment ? (
                        <div className="mt-4 border-l-2 pl-2.5 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Capture comment</span> · {reading.comment}
                        </div>
                      ) : null}
                      {reading.disputed ? (
                        <Alert className="mt-4 border-destructive/50 bg-destructive/10" variant="destructive">
                          <IconAlertTriangle aria-hidden />
                          <AlertTitle>Disputed reading</AlertTitle>
                          <AlertDescription className="text-muted-foreground">
                            {reading.disputeReason ?? 'Another reading disputes this value.'}
                          </AlertDescription>
                        </Alert>
                      ) : null}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">Meter photo</div>
                      {reading.photoBacked ? (
                        <MeterPhoto key={reading.id} reading={reading} onExpand={() => setPreview(true)} />
                      ) : (
                        <div className="mt-2 flex h-56 items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
                          No meter photo attached
                        </div>
                      )}
                    </div>
                  </div>
                </section>
                {reading.amendedAt ? (
                  <section aria-labelledby="amendment-heading" className="border-t pt-4">
                    <h3 className="mb-3 text-sm font-semibold" id="amendment-heading">
                      Amendment
                    </h3>
                    <div className="relative rounded-lg border bg-muted/50 p-4">
                      {amendReadings ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                aria-label="Edit amendment"
                                className="absolute top-3 right-3"
                                onClick={startAmending}
                                size="icon-sm"
                                variant="outline"
                              />
                            }
                          >
                            <IconPencil aria-hidden />
                          </TooltipTrigger>
                          <TooltipContent>Edit amendment</TooltipContent>
                        </Tooltip>
                      ) : null}
                      <h4 className="pr-10 text-base font-semibold">Recorded as {formatHours(reading.value)}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Amended <DateDisplay date={reading.amendedAt} format="medium" /> by{' '}
                        <span className="font-medium text-foreground">{reading.amendedByName ?? 'Unknown'}</span>
                      </p>
                      {reading.amendmentReason ? (
                        <blockquote className="mt-3 border-l-2 pl-2.5 text-sm">{reading.amendmentReason}</blockquote>
                      ) : null}
                      {amendmentSettledFinding ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          This amendment acknowledged the AI assessment below.
                        </p>
                      ) : null}
                    </div>
                  </section>
                ) : null}
                <Collapsible
                  key={`${reading.id}:${amendmentSettledFinding}`}
                  defaultOpen={!amendmentSettledFinding}
                  render={<section aria-labelledby="ai-assessment-heading" className="border-t pt-4" />}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    {amendmentSettledFinding ? (
                      <CollapsibleTrigger
                        className="group/ai flex min-w-0 items-center gap-2 text-left"
                        render={<button type="button" />}
                      >
                        <IconChevronRight
                          aria-hidden
                          className="size-4 shrink-0 transition-transform group-data-[panel-open]/ai:rotate-90"
                        />
                        <h3 className="text-sm font-semibold" id="ai-assessment-heading">
                          AI assessment of the photo
                        </h3>
                        <span className="truncate text-xs text-muted-foreground">{evidence?.badge} · acknowledged</span>
                      </CollapsibleTrigger>
                    ) : (
                      <h3 className="text-sm font-semibold" id="ai-assessment-heading">
                        AI assessment of the photo
                      </h3>
                    )}
                    {amendReadings && reading.photoBacked ? (
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
                          {evidence?.badge}
                        </Badge>
                        <h4 className="mt-2 text-base font-semibold">{evidence?.title}</h4>
                        <p className="mt-1 text-sm text-muted-foreground">{evidence?.description}</p>
                        {reading.aiHint ? (
                          <p className="mt-3 border-l-2 border-warning pl-2.5 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">AI hint</span> · {reading.aiHint}
                          </p>
                        ) : null}
                        {reading.evidenceReviewedAt ? (
                          <p className="mt-3 border-l-2 pl-2.5 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Review acknowledged</span> · The AI result is
                            retained for context.
                          </p>
                        ) : null}
                      </div>
                      <div className="border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-5">
                        <div className="text-xs font-medium text-muted-foreground">AI result</div>
                        <div className={`my-1 text-lg font-semibold ${tone.result}`}>{evidence?.result}</div>
                        <div className="mt-3 border-t pt-3">
                          <div aria-hidden className="mb-2 flex gap-1">
                            {confidenceSegments.map((segment) => (
                              <span
                                className={`h-1.5 w-4 rounded-sm ${reading.aiConfidence !== null && segment < Math.max(1, Math.round(reading.aiConfidence * 5)) ? tone.segment : 'bg-foreground/15'}`}
                                key={segment}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">{evidence?.confidenceCaption}</span>
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                  <ErrorMessage error={reverify.error} fallbackMessage="Unable to re-verify reading." />
                </Collapsible>
              </div>
              {reading.amendedAt ? (
                <DialogFooter>
                  <Button onClick={close} variant="outline">
                    Close
                  </Button>
                </DialogFooter>
              ) : amendReadings ? (
                <DialogFooter>
                  <Button onClick={startAmending}>Amend reading</Button>
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <ReadingAmendDialog
        reading={reading ?? null}
        machine={selected?.machine ?? null}
        open={amending && !!reading}
        onOpenChange={setAmending}
        description={amendDescription}
        onAmend={(input) => amend.mutateAsync(input)}
        onAmended={() => setAmending(false)}
        error={amend.error}
      />
      <MeterPhotoPreview
        photo={
          preview && reading && selected ? { readingId: reading.id, machineCode: selected.machine.machineCode } : null
        }
        description="Captured meter photo"
        onClose={() => setPreview(false)}
      />
    </>
  );
}
