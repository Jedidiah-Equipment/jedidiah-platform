import { breakdownUrgencyLabels } from '@pkg/domain/contracting';
import {
  type Assignment,
  BreakdownDescription,
  type BreakdownUrgency,
  breakdownSubjectKinds,
} from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import {
  ChoiceCard,
  type ReportPhoto,
  ReportPhotosField,
  sendBreakdownReport,
  UrgencyBanner,
} from '@/contracting/components/BreakdownReportParts.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

const ReportValues = z.object({ subjectKind: z.enum(breakdownSubjectKinds), description: BreakdownDescription });
type ReportValues = z.infer<typeof ReportValues>;

/** Reports a Code Green or Code Red on the stint's Machine or Implement, on this Job, with no location. */
export function ReportBreakdownDialog({
  report,
  onClose,
}: {
  report: { stint: Assignment; urgency: BreakdownUrgency } | null;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const { invalidateWorkshop } = useQueryInvalidation();
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  const implementId = report?.stint.implementId ?? null;
  // Only for the Implement's icon and category; the card falls back to its code alone.
  const implementsList = useQuery(
    trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled: !!implementId }),
  );
  const implement = implementsList.data?.find((entry) => entry.id === implementId) ?? null;
  const send = useMutation({
    mutationFn: async ({
      stint,
      urgency,
      values,
    }: {
      stint: Assignment;
      urgency: BreakdownUrgency;
      values: ReportValues;
    }) => {
      const subjectId = values.subjectKind === 'implement' ? stint.implementId : stint.machineId;
      if (!subjectId) throw new Error('This stint has no Implement.');
      return sendBreakdownReport(
        {
          subject: { kind: values.subjectKind, id: subjectId },
          jobId: stint.jobId,
          urgency,
          description: values.description,
        },
        photos,
      );
    },
  });
  const stint = report?.stint ?? null;
  const urgency = report?.urgency ?? null;
  const label = urgency ? breakdownUrgencyLabels[urgency] : '';
  const close = () => {
    send.reset();
    setPhotos([]);
    onClose();
  };
  return (
    <CreateEntityDialog
      contentClassName="sm:max-w-md"
      defaultValues={{ subjectKind: 'machine', description: '' } as ReportValues}
      disableSubmitWhenInvalid
      onCreate={async (values) => {
        if (!report) throw new Error('No Machine Assignment selected.');
        await send.mutateAsync({ ...report, values });
        await invalidateWorkshop();
        return true;
      }}
      onCreated={close}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      open={!!report}
      submitLabel={`Report ${label}`}
      title={<MachineDialogTitle machine={stint}>Report a problem</MachineDialogTitle>}
      validator={ReportValues}
    >
      {(form) => (
        <>
          {urgency ? <UrgencyBanner urgency={urgency} /> : null}
          {stint?.implementId ? (
            <form.AppField name="subjectKind">
              {(field) => (
                <Field>
                  <FieldLabel>What broke</FieldLabel>
                  <fieldset aria-label="What broke" className="grid grid-cols-2 gap-3">
                    <ChoiceCard
                      detail={stint.categoryName}
                      icon={<CategoryIcon colour={stint.categoryColour} icon={stint.categoryIcon} size={20} />}
                      kicker="Machine"
                      name={field.name}
                      onSelect={() => field.handleChange('machine')}
                      selected={field.state.value === 'machine'}
                      title={stint.machineCode}
                    />
                    <ChoiceCard
                      detail={implement?.categoryName ?? null}
                      icon={
                        implement ? (
                          <CategoryIcon colour={implement.categoryColour} icon={implement.categoryIcon} size={20} />
                        ) : null
                      }
                      kicker="Implement"
                      name={field.name}
                      onSelect={() => field.handleChange('implement')}
                      selected={field.state.value === 'implement'}
                      title={stint.implementCode ?? implement?.code ?? 'Implement'}
                    />
                  </fieldset>
                </Field>
              )}
            </form.AppField>
          ) : null}
          <ReportPhotosField onChange={setPhotos} photos={photos} />
          <form.AppField name="description">
            {(field) => <field.TextareaField label="What is wrong" rows={5} />}
          </form.AppField>
          <ErrorMessage error={send.error} fallbackMessage="Unable to report the Breakdown." />
        </>
      )}
    </CreateEntityDialog>
  );
}
