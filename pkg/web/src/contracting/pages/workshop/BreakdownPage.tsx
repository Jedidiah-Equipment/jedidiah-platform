import {
  fileContentTypeRejectedMessage,
  fileTooLargeMessage,
  formatDate,
  formatHours,
  formatNumber,
} from '@pkg/domain';
import {
  BREAKDOWN_PHOTO_POLICY,
  breakdownStatusColorClassNames,
  breakdownStatusLabels,
  breakdownUrgencyColorClassNames,
  breakdownUrgencyLabels,
  openJobQueues,
  reportToSolvedHours,
} from '@pkg/domain/contracting';
import {
  BREAKDOWN_MAX_PHOTOS,
  BreakdownDescription,
  type BreakdownDetail,
  BreakdownNoteText,
  type BreakdownPhoto,
  breakdownUrgencies,
} from '@pkg/schema/contracting';
import { IconExternalLink, IconPhoto, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { AttachmentField } from '@/components/attachments/AttachmentField.js';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { QueryContent } from '@/components/common/QueryContent.js';
import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { FilePreviewSheet } from '@/components/file-preview/FilePreviewSheet.js';
import { AutosaveFormCard } from '@/components/form/AutosaveFormCard.js';
import { useAppForm, useAutosaveForm } from '@/components/form/index.js';
import { HelpLink } from '@/components/help/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { breakdownPhotosUrl, breakdownPhotoUrl } from '@/contracting/lib/contracting-http-paths.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { MarkSolvedDialog } from './MarkSolvedDialog.js';
import { type BreakdownSheet, breakdownSheet } from './types.js';
import { useWorkshopWrite } from './use-workshop-write.js';

// A Foreman can add a note or a photo from the field while the workshop has the Breakdown open.
const BREAKDOWN_REFETCH_INTERVAL_MS = 30_000;

export function BreakdownPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.contractingBreakdowns.get.queryOptions({ id }, { refetchInterval: BREAKDOWN_REFETCH_INTERVAL_MS }),
  );
  const breakdown = query.data;
  const urgencyColours = breakdown ? breakdownUrgencyColorClassNames[breakdown.urgency] : null;
  const statusColours = breakdown ? breakdownStatusColorClassNames[breakdown.status] : null;
  return (
    <PageLayout
      title={
        breakdown ? (
          <CategoryLabel
            icon={breakdown.subject.categoryIcon}
            colour={breakdown.subject.categoryColour}
            name={breakdown.subject.code}
            size={24}
          />
        ) : (
          'Breakdown'
        )
      }
      description={
        breakdown
          ? `${breakdownUrgencyLabels[breakdown.urgency]} · reported ${formatDate(breakdown.reportedAt, 'medium')} by ${breakdown.reporterName}`
          : undefined
      }
      size="md"
      actions={
        breakdown && urgencyColours && statusColours ? (
          <div className="flex items-center gap-2">
            <Badge className={cn(urgencyColours.chip, urgencyColours.text)} variant="outline">
              {breakdownUrgencyLabels[breakdown.urgency]}
            </Badge>
            <Badge className={cn(statusColours.chip, statusColours.text)} variant="outline">
              {breakdownStatusLabels[breakdown.status]}
            </Badge>
          </div>
        ) : null
      }
    >
      <QueryContent errorMessage="Unable to load the Breakdown." query={query}>
        {(detail) => {
          const sheet = breakdownSheet(detail);
          return (
            <div className="space-y-5">
              <ReportCard key={`report-${detail.id}`} breakdown={detail} sheet={sheet} />
              <PhotosCard breakdown={detail} sheet={sheet} />
              <WorkshopCard breakdown={detail} sheet={sheet} />
              <DispatchHintsCard breakdown={detail} />
              <NotesCard breakdown={detail} sheet={sheet} />
            </div>
          );
        }}
      </QueryContent>
    </PageLayout>
  );
}

const ReportValues = z.object({
  description: BreakdownDescription,
  urgency: z.enum(breakdownUrgencies),
  jobId: z.string(),
});

function ReportCard({ breakdown, sheet }: { breakdown: BreakdownDetail; sheet: BreakdownSheet }) {
  const trpc = useTRPC();
  const write = useWorkshopWrite();
  const editable = sheet.can('editReport');
  const readsJobs = useCan('contracting_job:read').can;
  const jobs = useQuery(
    trpc.contractingJobs.jobs.list.queryOptions(
      { queues: [...openJobQueues], limit: 0 },
      { enabled: editable && readsJobs },
    ),
  );
  const jobOptions = (jobs.data?.items ?? []).map((job) => ({
    value: job.id,
    label: `${job.jobNumber} · ${job.farmName}`,
  }));
  if (breakdown.jobId && breakdown.jobNumber && !jobOptions.some((option) => option.value === breakdown.jobId))
    jobOptions.push({ value: breakdown.jobId, label: `${breakdown.jobNumber} · ${breakdown.farmName ?? ''}` });
  const patch = useMutation(trpc.contractingBreakdowns.patch.mutationOptions({ onSuccess: write.invalidateWorkshop }));
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: { description: breakdown.description, urgency: breakdown.urgency, jobId: breakdown.jobId ?? '' },
    failureMessage: 'Unable to update the report.',
    validator: ReportValues,
    toInput: (values) => ({
      id: breakdown.id,
      description: values.description,
      urgency: values.urgency,
      jobId: values.jobId || null,
    }),
    save: (input) => patch.mutateAsync(input),
  });
  return (
    <section aria-label="Report" className="space-y-2">
      <h2 className="font-heading text-lg">Report</h2>
      <ErrorMessage error={jobs.error} fallbackMessage="Unable to load Jobs." />
      <AutosaveFormCard autosave={autosave} formProps={formProps} disabled={!editable}>
        <form.AppField name="urgency">
          {(field) => (
            <field.SelectField
              label="Urgency"
              disabled={!editable}
              options={breakdownUrgencies.map((urgency) => ({
                value: urgency,
                label: breakdownUrgencyLabels[urgency],
              }))}
              onValueCommit={autosave.commit}
            />
          )}
        </form.AppField>
        <form.AppField name="jobId">
          {(field) => (
            <field.ComboboxField
              label="Job"
              disabled={!editable}
              placeholder="Search open Jobs..."
              emptyMessage="No open Jobs found."
              options={[{ value: '', label: 'No Job' }, ...jobOptions]}
              onValueCommit={autosave.commit}
            />
          )}
        </form.AppField>
        <form.AppField name="description">{(field) => <field.TextareaField label="What is wrong" />}</form.AppField>
      </AutosaveFormCard>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {breakdown.jobNumber ? (
          <Link className="hover:underline" params={{ code: breakdown.jobNumber }} to="/contracting/jobs/$code">
            Open {breakdown.jobNumber}
          </Link>
        ) : null}
        {breakdown.latitude !== null && breakdown.longitude !== null ? (
          <a
            className="inline-flex items-center gap-1 hover:underline"
            href={`https://www.google.com/maps?q=${breakdown.latitude},${breakdown.longitude}`}
            rel="noreferrer"
            target="_blank"
          >
            Open in Google Maps
            <IconExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        ) : (
          <span>No location was captured.</span>
        )}
      </div>
    </section>
  );
}

function PhotosCard({ breakdown, sheet }: { breakdown: BreakdownDetail; sheet: BreakdownSheet }) {
  const trpc = useTRPC();
  const write = useWorkshopWrite();
  const canAdd = sheet.can('addPhotos');
  const [previewing, setPreviewing] = useState<BreakdownPhoto | null>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const remove = useMutation(
    trpc.contractingBreakdowns.removePhoto.mutationOptions(write.card('Unable to remove the photo.')),
  );
  const upload = useMutation({
    mutationFn: async (photo: File) => {
      const body = new FormData();
      body.append('photo', photo, photo.name);
      const response = await fetch(breakdownPhotosUrl(breakdown.id), { method: 'POST', body, credentials: 'include' });
      if (response.ok) return;
      const payload = await response.json().catch(() => null);
      throw new Error(typeof payload?.message === 'string' ? payload.message : 'Unable to add the photo.');
    },
    onSuccess: async () => {
      setSelected(null);
      await write.invalidateWorkshop();
    },
    onError: (error) => setUploadError(error.message),
  });
  const previewId = previewing?.id ?? null;
  const fetchBlob = useCallback(
    async ({ signal }: { signal: AbortSignal }) => {
      if (!previewId) throw new Error('No photo selected.');
      const response = await fetch(breakdownPhotoUrl(breakdown.id, previewId), { signal, credentials: 'include' });
      if (!response.ok) throw new Error('Unable to preview the photo.');
      return response.blob();
    },
    [breakdown.id, previewId],
  );
  const full = breakdown.photos.length >= BREAKDOWN_MAX_PHOTOS;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Photos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {breakdown.photos.length ? (
          <ul className="flex flex-wrap gap-2">
            {breakdown.photos.map((photo, index) => (
              <li key={photo.id} className="flex items-center gap-1 rounded-md border p-1">
                <Button size="sm" variant="ghost" onClick={() => setPreviewing(photo)}>
                  <IconPhoto aria-hidden="true" />
                  Photo {formatNumber(index + 1)}
                </Button>
                {canAdd ? (
                  <Button
                    aria-label={`Remove photo ${formatNumber(index + 1)}`}
                    disabled={remove.isPending}
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => remove.mutate({ id: breakdown.id, photoId: photo.id })}
                  >
                    <IconTrash aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No photos.</p>
        )}
        {canAdd && !full ? (
          <AttachmentField
            label="Add a photo"
            file={selected}
            pending={upload.isPending}
            policy={BREAKDOWN_PHOTO_POLICY}
            {...(uploadError ? { error: uploadError } : {})}
            onChange={(photo) => {
              setUploadError('');
              setSelected(photo);
              if (!photo) return;
              if (!(BREAKDOWN_PHOTO_POLICY.allowedContentTypes as readonly string[]).includes(photo.type)) {
                setUploadError(fileContentTypeRejectedMessage(BREAKDOWN_PHOTO_POLICY.allowedContentTypes));
                return;
              }
              if (photo.size > BREAKDOWN_PHOTO_POLICY.maxBytes) {
                setUploadError(fileTooLargeMessage(BREAKDOWN_PHOTO_POLICY.maxBytes));
                return;
              }
              upload.mutate(photo);
            }}
          />
        ) : null}
      </CardContent>
      <FilePreviewSheet
        open={previewing !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewing(null);
        }}
        description={`Breakdown on ${breakdown.subject.code}`}
        downloadFilename={(blob) => `${breakdown.subject.code}-breakdown.${blob.type === 'image/png' ? 'png' : 'jpg'}`}
        fetchBlob={fetchBlob}
        kind="image"
        queryKey={['contracting-breakdown-photo', breakdown.id, previewId ?? 'closed']}
        staleTime={Infinity}
        subject="Breakdown photo"
        title={`${breakdown.subject.code} photo`}
      />
    </Card>
  );
}

function WorkshopCard({ breakdown, sheet }: { breakdown: BreakdownDetail; sheet: BreakdownSheet }) {
  const trpc = useTRPC();
  const write = useWorkshopWrite();
  const [solving, setSolving] = useState(false);
  const canAssign = sheet.can('assignMechanic');
  const mechanics = useQuery(
    trpc.contractingBreakdowns.options.mechanics.queryOptions(undefined, { enabled: canAssign }),
  );
  const assign = useMutation(
    trpc.contractingBreakdowns.assignMechanic.mutationOptions(write.card('Unable to assign the Mechanic.')),
  );
  const start = useMutation(trpc.contractingBreakdowns.start.mutationOptions(write.card('Unable to start work.')));
  const startAction = sheet.action('start');
  const solveAction = sheet.action('solve');
  const mechanicOptions = [
    { value: '', label: 'No mechanic' },
    ...(mechanics.data ?? []).map((person) => ({ value: person.id, label: person.name })),
  ];
  const solvedHours = reportToSolvedHours(breakdown);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workshop</CardTitle>
        <CardAction>
          <HelpLink label="How to run the workshop queue" topic="contractingBreakdown" />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <ErrorMessage error={mechanics.error} fallbackMessage="Unable to load mechanics." />
        <div className="space-y-2">
          <span className="block text-sm font-medium">Mechanic</span>
          {canAssign ? (
            <SearchableCombobox
              inputId="breakdown-mechanic"
              options={mechanicOptions}
              placeholder="Assign mechanic…"
              value={breakdown.primaryMechanicUserId ?? ''}
              onValueChange={(mechanicUserId) =>
                assign.mutate({ id: breakdown.id, mechanicUserId: mechanicUserId || null })
              }
            />
          ) : (
            <p className="text-sm">{breakdown.mechanicName ?? 'Unassigned'}</p>
          )}
        </div>
        {startAction || solveAction ? (
          <div className="flex flex-wrap gap-2">
            {startAction ? (
              <Button
                variant="outline"
                {...startAction}
                disabled={startAction.disabled || start.isPending}
                onClick={() => start.mutate({ id: breakdown.id })}
              >
                Start work
              </Button>
            ) : null}
            {solveAction ? (
              <Button {...solveAction} onClick={() => setSolving(true)}>
                Mark solved
              </Button>
            ) : null}
          </div>
        ) : null}
        {breakdown.status === 'solved' ? (
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">Close-out note</dt>
            <dd className="whitespace-pre-wrap">{breakdown.closeOutNote}</dd>
            <dt className="text-muted-foreground">Solved</dt>
            <dd>
              <DateDisplay date={breakdown.solvedAt} format="medium" />
              {breakdown.solvedByName ? ` by ${breakdown.solvedByName}` : null}
            </dd>
            {solvedHours !== null ? (
              <>
                <dt className="text-muted-foreground">Report to Solved</dt>
                <dd>{formatHours(solvedHours)}</dd>
              </>
            ) : null}
          </dl>
        ) : breakdown.startedAt ? (
          <p className="text-sm text-muted-foreground">
            Work started <DateDisplay date={breakdown.startedAt} format="medium" />
          </p>
        ) : null}
      </CardContent>
      <MarkSolvedDialog breakdownId={breakdown.id} open={solving} onOpenChange={setSolving} />
    </Card>
  );
}

function DispatchHintsCard({ breakdown }: { breakdown: BreakdownDetail }) {
  if (!breakdown.dispatchHints.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Also open on this Job</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {breakdown.dispatchHints.map((hint) => {
            const colours = breakdownUrgencyColorClassNames[hint.urgency];
            return (
              <li key={hint.breakdownId}>
                <Link
                  className="flex items-center gap-3 rounded-md border p-2 hover:bg-muted"
                  params={{ id: hint.breakdownId }}
                  to="/contracting/workshop/$id"
                >
                  <CategoryLabel
                    icon={hint.subject.categoryIcon}
                    colour={hint.subject.categoryColour}
                    name={<span className="font-mono font-semibold">{hint.subject.code}</span>}
                  />
                  <Badge className={cn(colours.chip, colours.text)} variant="outline">
                    {breakdownUrgencyLabels[hint.urgency]}
                  </Badge>
                  <span className="truncate text-sm text-muted-foreground">{hint.firstLine}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

const NoteValues = z.object({ text: BreakdownNoteText });

function NotesCard({ breakdown, sheet }: { breakdown: BreakdownDetail; sheet: BreakdownSheet }) {
  const trpc = useTRPC();
  const write = useWorkshopWrite();
  const add = useMutation(trpc.contractingBreakdowns.notes.add.mutationOptions(write.card('Unable to add note.')));
  const addAction = sheet.action('addNote');
  const form = useAppForm({
    defaultValues: { text: '' },
    validators: { onSubmit: NoteValues },
    onSubmit: async ({ value, formApi }) => {
      await add.mutateAsync({ breakdownId: breakdown.id, text: value.text }).then(
        () => {
          formApi.reset();
          toast.success('Note added');
        },
        () => undefined,
      );
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {breakdown.notes.length ? (
          <ol className="space-y-3">
            {breakdown.notes.map((note) => (
              <li key={note.id} className="space-y-1 border-l-2 pl-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{note.authorName}</span>
                  <DateDisplay date={note.createdAt} format="medium" />
                </div>
                <p className="whitespace-pre-wrap text-sm">{note.text}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
        {addAction ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.AppField name="text">
              {(field) => <field.TextareaField label="Add a note" disabled={addAction.disabled} />}
            </form.AppField>
            <Button type="submit" disabled={addAction.disabled || add.isPending} title={addAction.title}>
              Add note
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
