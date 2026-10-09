import { breakdownStatusLabels, breakdownSubjectKindLabels, breakdownUrgencyLabels } from '@pkg/domain/contracting';
import { UUID } from '@pkg/schema';
import {
  BreakdownDescription,
  type BreakdownSubjectKind,
  breakdownSubjectKinds,
  breakdownUrgencies,
  type FieldImplement,
  type FieldMachine,
} from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { requiredSelection } from '@/components/form/utils/form-schema.js';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { ReportPhotosField, UrgencyChoice, useBreakdownReport } from '@/contracting/components/BreakdownReportParts.js';
import { BreakdownUrgencyIcon } from '@/contracting/components/BreakdownSubjectLabel.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { useTRPC } from '@/lib/trpc.js';

const Urgency = z.enum(breakdownUrgencies);
const ReportValues = z.object({
  subjectKind: z.enum(breakdownSubjectKinds),
  subjectId: requiredSelection(UUID, 'Choose the Machine or Implement'),
  urgency: requiredSelection(Urgency, 'Choose Code Red or Code Green'),
  description: BreakdownDescription,
});
type ReportValues = z.infer<typeof ReportValues>;
const emptyValues: ReportValues = { subjectKind: 'machine', subjectId: '', urgency: '', description: '' };

type Subject = FieldMachine | FieldImplement;

/** Where the server will file the report: the Job the subject is on site on, if any. */
function attachHint(subject: Subject | undefined) {
  if (!subject) return null;
  const job = 'busyOnJob' in subject ? subject.busyOnJob : null;
  if (job) return `Attaches to ${job.customerName} · ${job.farmName} (${job.jobNumber}), where it is on site.`;
  if (subject.onSiteJobNumber) return `Attaches to ${subject.onSiteJobNumber}, where it is on site.`;
  return 'Not on site on a Job, so it is filed without one.';
}

/** The subject's open Breakdowns, so a problem already in the Workshop is not reported twice. */
function AlreadyReported({ kind, id }: { kind: BreakdownSubjectKind; id: string }) {
  const trpc = useTRPC();
  const open = useQuery(trpc.contractingBreakdowns.field.openOnSubject.queryOptions({ kind, id }, { enabled: !!id }));
  if (!open.data?.length) return null;
  return (
    <Field>
      <FieldLabel>Already reported</FieldLabel>
      <FieldDescription>
        If the problem is listed here, open it and add a note instead of reporting it again.
      </FieldDescription>
      <ul className="grid gap-2">
        {open.data.map((breakdown) => (
          <li key={breakdown.id}>
            <Link
              className="flex items-center gap-2 rounded-lg border p-2 text-sm hover:bg-muted/50"
              params={{ id: breakdown.id }}
              target="_blank"
              to="/contracting/workshop/$id"
            >
              <BreakdownUrgencyIcon size={14} urgency={breakdown.urgency} />
              <span className="min-w-0 flex-1 truncate">{breakdown.firstLine}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{breakdownStatusLabels[breakdown.status]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Field>
  );
}

/**
 * The Workshop's own way in to a Breakdown, as the phone's Workshop tab has: pick the Machine or Implement, the code,
 * photos and what is wrong. The Job is the one the subject is on site on, and no location is recorded.
 */
export function ReportProblemDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { photos, setPhotos, send, reset } = useBreakdownReport();
  const machines = useQuery(trpc.contractingReadings.fieldMachines.queryOptions(undefined, { enabled: open }));
  const implementList = useQuery(trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled: open }));
  const subjectsOf = (kind: BreakdownSubjectKind): Subject[] =>
    (kind === 'machine' ? machines.data : implementList.data) ?? [];
  const close = () => {
    reset();
    onOpenChange(false);
  };
  return (
    <CreateEntityDialog
      canSubmit={machines.isSuccess || implementList.isSuccess}
      contentClassName="sm:max-w-lg"
      defaultValues={emptyValues}
      disableSubmitWhenInvalid
      onCreate={(values) =>
        send.mutateAsync({
          subject: { kind: values.subjectKind, id: values.subjectId },
          urgency: Urgency.parse(values.urgency),
          description: values.description,
        })
      }
      onCreated={(reported) => {
        close();
        void navigate({ to: '/contracting/workshop/$id', params: { id: reported.id } });
      }}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      open={open}
      submitLabel={(values) => {
        const urgency = Urgency.safeParse(values.urgency);
        return urgency.success ? `Report ${breakdownUrgencyLabels[urgency.data]}` : 'Send report';
      }}
      title="Report a problem"
      validator={ReportValues}
    >
      {(form) => (
        <>
          <form.Subscribe selector={(state) => state.values.subjectKind}>
            {(kind) => (
              <>
                <Field>
                  <FieldLabel>What has the problem?</FieldLabel>
                  <Tabs
                    value={kind}
                    onValueChange={(next) => {
                      form.setFieldValue('subjectKind', next as BreakdownSubjectKind);
                      form.setFieldValue('subjectId', '');
                    }}
                  >
                    <TabsList aria-label="What has the problem?">
                      {breakdownSubjectKinds.map((option) => (
                        <TabsTrigger key={option} value={option}>
                          {breakdownSubjectKindLabels[option]}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </Field>
                <form.AppField name="subjectId">
                  {(field) => (
                    <>
                      <field.ComboboxField
                        emptyMessage="Nothing matches."
                        label={breakdownSubjectKindLabels[kind]}
                        options={subjectsOf(kind).map((subject) => ({
                          value: subject.id,
                          label: `${subject.code} · ${subject.categoryName}`,
                          icon: <CategoryIcon colour={subject.categoryColour} icon={subject.categoryIcon} size={14} />,
                        }))}
                        placeholder={`Choose the ${breakdownSubjectKindLabels[kind]}`}
                      />
                      <form.Subscribe selector={(state) => state.values.subjectId}>
                        {(id) => {
                          const hint = attachHint(subjectsOf(kind).find((subject) => subject.id === id));
                          return (
                            <>
                              {hint ? <FieldDescription>{hint}</FieldDescription> : null}
                              <AlreadyReported id={id} kind={kind} />
                            </>
                          );
                        }}
                      </form.Subscribe>
                    </>
                  )}
                </form.AppField>
              </>
            )}
          </form.Subscribe>
          <form.AppField name="urgency">
            {(field) => (
              <Field>
                <FieldLabel>How bad is it?</FieldLabel>
                <UrgencyChoice
                  name={field.name}
                  onChange={(urgency) => field.handleChange(urgency)}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.AppField>
          <ReportPhotosField onChange={setPhotos} photos={photos} />
          <form.AppField name="description">
            {(field) => <field.TextareaField label="What is wrong" rows={5} />}
          </form.AppField>
          <ErrorMessage error={machines.error ?? implementList.error} fallbackMessage="Unable to load the fleet." />
          <ErrorMessage error={send.error} fallbackMessage="Unable to report the Breakdown." />
        </>
      )}
    </CreateEntityDialog>
  );
}
