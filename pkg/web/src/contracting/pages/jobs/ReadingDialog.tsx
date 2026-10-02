import { formatHours, statusBadgeColorClassNames } from '@pkg/domain';
import type { Assignment, JobReading } from '@pkg/schema/contracting';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
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
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { fetchMeterPhoto, MeterPhotoPreview, meterPhotoQueryKey } from '@/contracting/components/MeterPhotoPreview.js';
import { type AssessmentTone, readingAssessment } from '@/contracting/components/ReadingEvidence.js';
import { useReadingReview } from '@/contracting/hooks/use-reading-review.js';

import { ReadingAmendDialog } from './ReadingAmendDialog.js';

const confidenceSegments = [0, 1, 2, 3, 4];

const toneClasses: Record<AssessmentTone, { badge: string; result: string; segment: string }> = {
  success: {
    badge: `${statusBadgeColorClassNames.green.chip} ${statusBadgeColorClassNames.green.text}`,
    result: statusBadgeColorClassNames.green.text,
    segment: statusBadgeColorClassNames.green.dot,
  },
  warning: { badge: 'border-warning/50 bg-warning/10 text-warning', result: 'text-warning', segment: 'bg-warning' },
  destructive: {
    badge: 'border-destructive/40 bg-destructive/10 text-destructive',
    result: 'text-destructive',
    segment: 'bg-destructive',
  },
  info: {
    badge: `${statusBadgeColorClassNames.blue.chip} ${statusBadgeColorClassNames.blue.text}`,
    result: statusBadgeColorClassNames.blue.text,
    segment: statusBadgeColorClassNames.blue.dot,
  },
  neutral: {
    badge: 'border-border bg-muted/30 text-muted-foreground',
    result: 'text-muted-foreground',
    segment: 'bg-muted-foreground',
  },
};

function MeterPhoto({ reading, onExpand }: { reading: JobReading; onExpand: () => void }) {
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
}: {
  selected: { reading: JobReading; stint: Assignment } | null;
  onClose: () => void;
  amendReadings: boolean;
}) {
  const [amending, setAmending] = useState(false);
  const [preview, setPreview] = useState(false);
  const { amend, reverify } = useReadingReview();
  const reading = selected?.reading;
  const evidence = reading ? readingAssessment(reading) : null;
  const tone = evidence ? toneClasses[evidence.tone] : toneClasses.neutral;

  return (
    <>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setAmending(false);
            setPreview(false);
            onClose();
          }
        }}
      >
        <DialogContent className="sm:max-w-[780px]">
          <DialogHeader>
            <DialogTitle>
              <MachineDialogTitle machine={selected?.stint ?? null}>{reading?.role ?? 'Reading'}</MachineDialogTitle>
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
                      {reading.amendedAt ? (
                        <div className="mt-4 border-l-2 pl-2.5 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            Amended <DateDisplay date={reading.amendedAt} format="medium" />
                          </span>{' '}
                          · {reading.amendmentReason}
                        </div>
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
                <section aria-labelledby="ai-assessment-heading" className="border-t pt-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold" id="ai-assessment-heading">
                      AI assessment of the photo
                    </h3>
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
                  <ErrorMessage error={reverify.error} fallbackMessage="Unable to re-verify reading." />
                </section>
              </div>
              {amendReadings ? (
                <DialogFooter>
                  <Button
                    onClick={() => {
                      amend.reset();
                      setAmending(true);
                    }}
                  >
                    Amend reading
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <ReadingAmendDialog
        reading={reading ?? null}
        machine={selected?.stint ?? null}
        open={amending && !!reading}
        onOpenChange={setAmending}
        onAmend={(input) => amend.mutateAsync(input)}
        onAmended={() => setAmending(false)}
        error={amend.error}
      />
      <MeterPhotoPreview
        photo={
          preview && reading && selected ? { readingId: reading.id, machineCode: selected.stint.machineCode } : null
        }
        description="Captured meter photo"
        onClose={() => setPreview(false)}
      />
    </>
  );
}
