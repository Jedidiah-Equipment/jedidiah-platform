import { formatHours } from '@pkg/domain';
import { type Assignment, type JobReading, ReadingAmendInput } from '@pkg/schema/contracting';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { FilePreviewSheet } from '@/components/file-preview/FilePreviewSheet.js';
import { CreateEntityDialog } from '@/components/form/index.js';
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
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { readingPhotoUrl } from '@/contracting/lib/contracting-http-paths.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

const AmendValues = ReadingAmendInput.omit({ id: true });
const confidenceSegments = [0, 1, 2, 3, 4];

async function fetchReadingPhoto(readingId: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(readingPhotoUrl(readingId), { signal, credentials: 'include' });
  if (!response.ok) throw new Error('Unable to preview meter photo.');
  return response.blob();
}

type Tone = 'success' | 'warning' | 'destructive' | 'info' | 'neutral';

const toneClasses: Record<Tone, { badge: string; result: string; segment: string }> = {
  success: {
    badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
    result: 'text-emerald-300',
    segment: 'bg-emerald-400',
  },
  warning: { badge: 'border-warning/50 bg-warning/10 text-warning', result: 'text-warning', segment: 'bg-warning' },
  destructive: {
    badge: 'border-destructive/40 bg-destructive/10 text-destructive',
    result: 'text-destructive',
    segment: 'bg-destructive',
  },
  info: { badge: 'border-sky-500/40 bg-sky-500/10 text-sky-300', result: 'text-sky-300', segment: 'bg-sky-400' },
  neutral: {
    badge: 'border-border bg-muted/30 text-muted-foreground',
    result: 'text-muted-foreground',
    segment: 'bg-muted-foreground',
  },
};

function assessment(reading: JobReading) {
  if (!reading.photoBacked)
    return {
      tone: 'neutral' as const,
      badge: 'No AI result',
      title: 'No photo to analyse',
      description: 'The recorded reading has no meter photo, so AI cannot check its value.',
      result: 'No analysis',
    };
  if (reading.aiVerification === 'pending')
    return {
      tone: 'info' as const,
      badge: 'Checking photo',
      title: 'Photo analysis pending',
      description: 'The captured photo is available, but AI has not returned a result yet.',
      result: 'Waiting for result',
    };
  if (reading.aiValue === null)
    return {
      tone: 'destructive' as const,
      badge: 'Cannot verify from photo',
      title: 'No readable meter found',
      description: `AI could not find a readable hour meter in the photo. This does not confirm the recorded ${formatHours(reading.value)}.`,
      result: 'No readable meter',
    };
  if (reading.aiVerification === 'low-confidence')
    return {
      tone: 'warning' as const,
      badge: 'Uncertain result',
      title: 'Possible reading, not reliable',
      description: `AI tentatively read ${formatHours(reading.aiValue)}. The image is too unclear to verify the recorded ${formatHours(reading.value)}.`,
      result: `Possibly ${formatHours(reading.aiValue)}`,
    };
  if (reading.aiVerification === 'disagrees')
    return {
      tone: 'destructive' as const,
      badge: 'Different value found',
      title: 'AI reading differs',
      description: `AI read ${formatHours(reading.aiValue)} from the photo; the recorded reading is ${formatHours(reading.value)}. Review the photo before amending.`,
      result: formatHours(reading.aiValue),
    };
  return {
    tone: 'success' as const,
    badge: 'Same value found',
    title: 'AI reading matches',
    description: `AI read ${formatHours(reading.aiValue)} from the photo, matching the recorded reading.`,
    result: formatHours(reading.aiValue),
  };
}

function confidenceLabel(reading: JobReading): string {
  if (!reading.photoBacked) return 'No photo to assess';
  if (reading.aiConfidence === null) return 'Waiting for AI';
  const grade = reading.aiConfidence >= 0.9 ? 'High' : reading.aiConfidence >= 0.8 ? 'Moderate' : 'Low';
  return reading.aiValue === null
    ? `${grade} certainty that no readable meter is visible`
    : `${grade} confidence in the extracted value`;
}

function MeterPhoto({ reading, onExpand }: { reading: JobReading; onExpand: () => void }) {
  const photoQuery = useQuery({
    queryKey: ['contracting-reading-photo', reading.id],
    queryFn: ({ signal }) => fetchReadingPhoto(reading.id, signal),
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
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const { invalidateJobs, invalidateReadings } = useQueryInvalidation();
  const [amending, setAmending] = useState(false);
  const [preview, setPreview] = useState(false);
  const amend = useMutation(
    trpc.contractingReadings.amend.mutationOptions({
      onSuccess: async () => {
        await Promise.all([invalidateJobs(), invalidateReadings()]);
        toast.success('Reading amended');
      },
      onError: (error) => showError(error, 'Unable to amend reading.'),
    }),
  );
  const reverify = useMutation(
    trpc.contractingReadings.reverify.mutationOptions({
      onSuccess: async () => {
        await Promise.all([invalidateJobs(), invalidateReadings()]);
      },
      onError: (error) => showError(error, 'Unable to re-verify reading.'),
    }),
  );
  const reading = selected?.reading;
  const evidence = reading ? assessment(reading) : null;
  const tone = evidence ? toneClasses[evidence.tone] : toneClasses.neutral;
  const fetchBlob = useCallback(
    ({ signal }: { signal: AbortSignal }) => {
      if (!reading) throw new Error('No reading selected.');
      return fetchReadingPhoto(reading.id, signal);
    },
    [reading],
  );

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
              {selected?.stint.machineCode ?? 'Reading'} · {reading?.role ?? ''}
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
                        <span className="text-xs text-muted-foreground">{confidenceLabel(reading)}</span>
                      </div>
                    </div>
                  </div>
                  <ErrorMessage error={reverify.error} fallbackMessage="Unable to re-verify reading." />
                </section>
              </div>
              {amendReadings ? (
                <DialogFooter>
                  <Button onClick={() => setAmending(true)}>Amend reading</Button>
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <CreateEntityDialog
        key={reading?.id ?? 'closed'}
        open={amending && !!reading}
        onOpenChange={setAmending}
        title="Amend reading"
        description="Hours and gaps recompute from the amended value."
        defaultValues={{ value: reading?.value ?? 0, reason: '' }}
        validator={AmendValues}
        onCreate={(values) => amend.mutateAsync({ id: reading?.id ?? '', ...values })}
        onCreated={() => setAmending(false)}
      >
        {(form) => (
          <>
            <form.AppField name="value">{(field) => <field.NumberField label="Hours" decimals={1} />}</form.AppField>
            <form.AppField name="reason">{(field) => <field.TextareaField label="Reason" />}</form.AppField>
          </>
        )}
      </CreateEntityDialog>
      <FilePreviewSheet
        open={preview && !!reading}
        onOpenChange={setPreview}
        description="Captured meter photo"
        downloadFilename={`${selected?.stint.machineCode ?? 'meter'}-reading.jpg`}
        fetchBlob={fetchBlob}
        kind="image"
        queryKey={['contracting-reading-photo', reading?.id ?? 'closed']}
        staleTime={Infinity}
        subject="meter photo"
        title={`${selected?.stint.machineCode ?? 'Machine'} meter photo`}
      />
    </>
  );
}
