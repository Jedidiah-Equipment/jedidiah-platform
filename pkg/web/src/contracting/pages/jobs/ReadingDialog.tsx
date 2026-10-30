import { formatDate, formatHours, getFirstName } from '@pkg/domain';
import { disputedReadingReason, isBackdated } from '@pkg/domain/contracting';
import type { JobReading } from '@pkg/schema/contracting';
import { IconAlertTriangle, IconPencil } from '@tabler/icons-react';
import { useState } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { type MachineDialogSubject, MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useReadingReview } from '@/contracting/hooks/use-reading-review.js';
import { ReadingAmendDialog } from './ReadingAmendDialog.js';

/** Everything the reading dialog shows about one Hour Reading on a Job sheet. */
export type DialogReading = Omit<JobReading, 'attention'>;

export function ReadingDialog({
  selected,
  onClose,
  amendReadings,
}: {
  selected: { reading: DialogReading; machine: MachineDialogSubject } | null;
  onClose: () => void;
  amendReadings: boolean;
}) {
  const [amending, setAmending] = useState(false);
  const { amend } = useReadingReview();
  const reading = selected?.reading;
  const close = () => {
    setAmending(false);
    onClose();
  };
  const startAmending = () => {
    amend.reset();
    setAmending(true);
  };

  return (
    <>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <MachineDialogTitle machine={selected?.machine ?? null}>{reading?.role ?? 'Reading'}</MachineDialogTitle>
            </DialogTitle>
            <DialogDescription>Hours and gaps recompute from the amended value and time.</DialogDescription>
          </DialogHeader>
          {reading ? (
            <>
              <div className="space-y-4">
                <section aria-labelledby="recorded-reading-heading">
                  <h3 className="mb-3 text-sm font-semibold" id="recorded-reading-heading">
                    Recorded reading
                  </h3>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Hour meter value</div>
                    <div className="my-1 text-4xl font-semibold tracking-tight">{formatHours(reading.value)}</div>
                    <div className="text-sm text-muted-foreground">
                      Read At {formatDate(reading.capturedAt, 'medium')}
                      <br />
                      by{' '}
                      <span className="font-medium text-foreground">
                        {reading.capturedByName ? getFirstName(reading.capturedByName) : 'Unknown'}
                      </span>
                      {isBackdated(new Date(reading.capturedAt), new Date(reading.createdAt)) ? (
                        <>
                          <br />
                          saved {formatDate(reading.createdAt, 'medium')}
                        </>
                      ) : null}
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
                          {disputedReadingReason(reading)}
                        </AlertDescription>
                      </Alert>
                    ) : null}
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
                        <span className="font-medium text-foreground">
                          {reading.amendedByName ? getFirstName(reading.amendedByName) : 'Unknown'}
                        </span>
                      </p>
                      {reading.amendmentReason ? (
                        <blockquote className="mt-3 border-l-2 pl-2.5 text-sm">{reading.amendmentReason}</blockquote>
                      ) : null}
                    </div>
                  </section>
                ) : null}
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
        onAmend={(input) => amend.mutateAsync(input)}
        onAmended={() => setAmending(false)}
        error={amend.error}
      />
    </>
  );
}
