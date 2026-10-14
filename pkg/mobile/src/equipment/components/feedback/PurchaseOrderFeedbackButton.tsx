import { getFeedbackVisibilityNotice } from '@pkg/domain/equipment';
import { type FeedbackPurchaseOrder, FeedbackText } from '@pkg/schema/equipment';
import { IconShoppingCart } from '@tabler/icons-react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';

import { useAppForm } from '@/components/form';
import { AccentButton } from '@/components/ui/accent-button';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { useTRPC } from '@/lib/trpc';
import { FeedbackModalFrame, FeedbackSubmitButton, feedbackErrorMessage } from './FeedbackModalFrame';

const notice = getFeedbackVisibilityNotice('general', 'purchase-order');

/**
 * Mirror of web's `PurchaseOrderFeedbackButton` on a Job: General Feedback about one of the Job's linked Purchase
 * Orders, so the form is the order and the note. A Job with no linked orders offers nothing.
 */
export function PurchaseOrderFeedbackButton({
  jobCode,
  purchaseOrders,
}: {
  jobCode: string;
  purchaseOrders: FeedbackPurchaseOrder[];
}) {
  const [open, setOpen] = useState(false);
  if (purchaseOrders.length === 0) return null;

  return (
    <>
      <AccentButton icon={IconShoppingCart} label="Send PO Feedback" onPress={() => setOpen(true)} />
      {/* Mount fresh each open so the form starts from defaults, mirroring web's remount-on-open. */}
      {open ? (
        <PurchaseOrderFeedbackModal jobCode={jobCode} onClose={() => setOpen(false)} purchaseOrders={purchaseOrders} />
      ) : null}
    </>
  );
}

function PurchaseOrderFeedbackModal({
  jobCode,
  onClose,
  purchaseOrders,
}: {
  jobCode: string;
  onClose: () => void;
  purchaseOrders: FeedbackPurchaseOrder[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showToast = useAppToast();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitMutation = useMutation(trpc.feedback.submit.mutationOptions());

  const form = useAppForm({
    defaultValues: { purchaseOrderId: purchaseOrders.length === 1 ? (purchaseOrders[0]?.id ?? '') : '', text: '' },
    validators: {
      onSubmit: z.object({
        purchaseOrderId: z
          .string()
          .refine((id) => purchaseOrders.some((order) => order.id === id), 'Select a Purchase Order'),
        text: FeedbackText,
      }),
    },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        await submitMutation.mutateAsync({
          kind: 'general',
          subject: { subjectType: 'purchase-order', purchaseOrderId: value.purchaseOrderId },
          text: value.text,
        });
      } catch (error) {
        setSubmitError(feedbackErrorMessage(error));
        return;
      }
      onClose();
      showToast('success', 'Feedback submitted');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.feedback.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.jobActivity.pathKey() }),
      ]);
    },
  });

  return (
    <FeedbackModalFrame
      about={
        <>
          About a Purchase Order linked to{' '}
          <Text className="text-muted-foreground" mono>
            {jobCode}
          </Text>
        </>
      }
      error={submitError}
      footer={
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <FeedbackSubmitButton
              isSubmitting={isSubmitting}
              label={notice.submitLabel}
              onPress={() => void form.handleSubmit()}
            />
          )}
        </form.Subscribe>
      }
      onClose={onClose}
    >
      <Text className="text-sm text-muted-foreground">{notice.description}</Text>
      <form.AppField name="purchaseOrderId">
        {(field) => (
          <field.SelectField
            label="Purchase Order"
            options={purchaseOrders.map((order) => ({
              label: `${order.code} · ${order.supplierName}`,
              value: order.id,
            }))}
          />
        )}
      </form.AppField>
      <form.AppField name="text">
        {(field) => <field.TextareaField label="Feedback" placeholder="Describe what you noticed…" rows={5} />}
      </form.AppField>
    </FeedbackModalFrame>
  );
}
