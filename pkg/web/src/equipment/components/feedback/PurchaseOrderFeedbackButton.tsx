import { getFeedbackVisibilityNotice } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import { type FeedbackPurchaseOrder, FeedbackText } from '@pkg/schema/equipment';
import { IconMessagePlus, IconShoppingCart } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

const notice = getFeedbackVisibilityNotice('general', 'purchase-order');

/**
 * Purchase Order Feedback is always General and public, so the form is the note alone: on the order itself, or on a
 * Job, the note and which of its linked orders it is about. A Job with no linked orders offers nothing.
 */
export const PurchaseOrderFeedbackButton: React.FC<
  { purchaseOrder: { id: UUID; code: string } } | { job: { code: string; purchaseOrders: FeedbackPurchaseOrder[] } }
> = (props) => {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const { invalidateFeedback, invalidateJobActivity } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const submit = useMutation(
    trpc.feedback.submit.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to submit feedback.'),
    }),
  );

  const view =
    'job' in props
      ? {
          icon: <IconShoppingCart data-icon="inline-start" />,
          label: 'Send PO Feedback',
          about: `a Purchase Order linked to ${props.job.code}`,
          picker: props.job.purchaseOrders,
          orderIds: props.job.purchaseOrders.map((order) => order.id),
        }
      : {
          icon: <IconMessagePlus data-icon="inline-start" />,
          label: 'Send Feedback',
          about: props.purchaseOrder.code,
          picker: null,
          orderIds: [props.purchaseOrder.id],
        };
  if (view.orderIds.length === 0) return null;

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
        {view.icon}
        {view.label}
      </Button>
      <CreateEntityDialog
        defaultValues={{ purchaseOrderId: view.orderIds.length === 1 ? (view.orderIds[0] ?? '') : '', text: '' }}
        description={`Share feedback about ${view.about}. ${notice.description}`}
        onCreate={(values) =>
          submit.mutateAsync({
            kind: 'general',
            subject: { subjectType: 'purchase-order', purchaseOrderId: values.purchaseOrderId },
            text: values.text,
          })
        }
        onCreated={async () => {
          setOpen(false);
          toast.success('Feedback submitted');
          await Promise.all([invalidateFeedback(), invalidateJobActivity()]);
        }}
        onOpenChange={setOpen}
        open={open}
        submitLabel={notice.submitLabel}
        title="Send feedback"
        validator={z.object({
          purchaseOrderId: z.string().refine((id) => view.orderIds.includes(id), 'Select a Purchase Order'),
          text: FeedbackText,
        })}
      >
        {(form) => (
          <>
            {view.picker ? (
              <form.AppField name="purchaseOrderId">
                {(field) => (
                  <field.SelectField
                    label="Purchase Order"
                    options={view.picker.map((order) => ({
                      label: `${order.code} · ${order.supplierName}`,
                      value: order.id,
                    }))}
                  />
                )}
              </form.AppField>
            ) : null}
            <form.AppField name="text">
              {(field) => <field.TextareaField label="Feedback" placeholder="Describe what you noticed…" rows={5} />}
            </form.AppField>
          </>
        )}
      </CreateEntityDialog>
    </>
  );
};
