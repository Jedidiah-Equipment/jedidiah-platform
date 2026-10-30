import { formatQuantity } from '@pkg/domain';
import { type AssignmentDetail, MeasureValues } from '@pkg/schema/contracting';
import { IconTrash } from '@tabler/icons-react-native';
import { revalidateLogic } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pressable, View } from 'react-native';
import { useAppForm } from '@/components/form';
import { ModalSheet, SheetSubmitButton } from '@/components/ModalSheet';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { useTRPC } from '@/lib/trpc';
import { useBusyAction } from '@/lib/use-busy-action';
import { useMeasureTypes } from './use-jobs';

const SAVE_FAILED = 'Could not save the Measure. Check your connection and try again.';
const REMOVE_FAILED = 'Could not remove the Measure. Check your connection and try again.';

/** Adds, edits and removes one Machine Assignment's Measures; mounted while open, so each open starts fresh. */
export function MeasuresSheet({ stint, onClose }: { stint: AssignmentDetail; onClose: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const types = useMeasureTypes();
  const showToast = useAppToast();
  const { busy, error, run } = useBusyAction();
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.pathKey() });
  const set = useMutation(trpc.contractingJobs.measures.set.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(trpc.contractingJobs.measures.remove.mutationOptions({ onSuccess: refresh }));
  const defaultValues: MeasureValues = { measureTypeId: '', quantity: 1 };
  const form = useAppForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: MeasureValues },
    onSubmit: ({ value }) =>
      run(async () => {
        await set.mutateAsync({ assignmentId: stint.id, ...MeasureValues.parse(value) });
        onClose();
        showToast('success', 'Measure saved');
      }, SAVE_FAILED),
  });
  const recorded = (measureTypeId: string) => stint.measures.find((measure) => measure.measureTypeId === measureTypeId);
  return (
    <ModalSheet
      title="Measures"
      subtitle={stint.implementCode ? `${stint.machineCode} · ${stint.implementCode}` : stint.machineCode}
      error={error}
      footer={<SheetSubmitButton isSubmitting={busy} label="Save measure" onPress={() => void form.handleSubmit()} />}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {stint.measures.length ? (
        <View className="gap-1 border-b border-border pb-3">
          <Text className="text-sm text-foreground" weight="semibold">
            Recorded
          </Text>
          {stint.measures.map((measure) => (
            <View className="flex-row items-center justify-between gap-2" key={measure.id}>
              <Text className="text-foreground">
                {formatQuantity(measure.quantity)} {measure.measureTypeName}
              </Text>
              <Pressable
                accessibilityLabel={`Remove ${measure.measureTypeName}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                className="h-10 w-10 items-center justify-center rounded-lg active:bg-muted"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await remove.mutateAsync({ assignmentId: stint.id, measureTypeId: measure.measureTypeId });
                  }, REMOVE_FAILED)
                }
              >
                <Icon className="text-danger" icon={IconTrash} size={17} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <form.AppField name="measureTypeId">
        {(field) => (
          <field.SelectField
            label="Measure Type"
            placeholder="Choose a Measure Type"
            emptyMessage={types.isError ? 'The Measure Types could not be loaded.' : 'No Measure Types yet.'}
            options={(types.data ?? []).map((type) => ({
              value: type.id,
              label: recorded(type.id) ? `${type.name} (editing)` : type.name,
            }))}
            // Choosing one already recorded edits it, so its quantity is the starting point.
            onValueCommit={() =>
              form.setFieldValue('quantity', recorded(form.getFieldValue('measureTypeId'))?.quantity ?? 1)
            }
          />
        )}
      </form.AppField>
      <form.AppField name="quantity">{(field) => <field.NumberField label="Quantity" />}</form.AppField>
    </ModalSheet>
  );
}
