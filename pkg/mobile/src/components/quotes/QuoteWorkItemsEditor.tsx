import { createStableRowKeys, formatCurrency, getWorkItemFormTotal } from '@pkg/domain';
import type { QuoteDetail, QuoteUpdateInput } from '@pkg/schema';
import { IconPlus, IconTrash } from '@tabler/icons-react-native';
import type React from 'react';
import { Pressable, View } from 'react-native';

import type { useAutosaveForm } from '@/components/form';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { QuoteEditFormValues } from '@/lib/quote-presentation';

type QuoteEditAutosaveForm = ReturnType<typeof useAutosaveForm<QuoteEditFormValues, QuoteUpdateInput, QuoteDetail>>;

type QuoteWorkItemsEditorProps = {
  autosave: Pick<QuoteEditAutosaveForm['autosave'], 'commit' | 'markChanged'>;
  currencyCode: string;
  form: QuoteEditAutosaveForm['form'];
  hourlyRate: number;
  readOnly: boolean;
};

type QuoteWorkItemFormValue = QuoteEditFormValues['workItems'][number];

const getWorkItemKey = createStableRowKeys<QuoteWorkItemFormValue>('quote-work-item');
const getWorkItemPartKey = createStableRowKeys<QuoteWorkItemFormValue['parts'][number]>('quote-work-item-part');

export function QuoteWorkItemsEditor({
  autosave,
  currencyCode,
  form,
  hourlyRate,
  readOnly,
}: QuoteWorkItemsEditorProps) {
  return (
    <form.Field name="workItems" mode="array">
      {(workItemsField) => (
        <WorkItemsSection
          action={
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: readOnly }}
              className={`flex-row items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 ${
                readOnly ? 'opacity-50' : 'active:bg-surface'
              }`}
              disabled={readOnly}
              onPress={() => {
                workItemsField.pushValue({ hours: 0, name: '', parts: [] });
                autosave.markChanged();
              }}
            >
              <Icon className="text-primary" icon={IconPlus} size={15} />
              <Text className="text-xs text-foreground" weight="semibold">
                Add work item
              </Text>
            </Pressable>
          }
        >
          {workItemsField.state.value.length === 0 ? (
            <View className="rounded-xl border border-dashed border-border px-4 py-7">
              <Text className="text-center text-sm text-muted-foreground">No work items.</Text>
            </View>
          ) : (
            <View className="gap-3">
              {workItemsField.state.value.map((workItem, workItemIndex) => (
                <View className="gap-4 rounded-xl border border-border bg-muted/10 p-3" key={getWorkItemKey(workItem)}>
                  <form.AppField name={`workItems[${workItemIndex}].name`}>
                    {(field) => (
                      <field.TextField disabled={readOnly} label="Work item" onValueCommit={autosave.commit} />
                    )}
                  </form.AppField>
                  <View className="gap-3 md:flex-row">
                    <View className="flex-1">
                      <form.AppField name={`workItems[${workItemIndex}].hours`}>
                        {(field) => (
                          <field.NumberField disabled={readOnly} label="Hours" onValueCommit={autosave.commit} />
                        )}
                      </form.AppField>
                    </View>
                    <View className="flex-1 justify-end rounded-xl border border-border bg-surface px-3 py-2.5">
                      <Text className="text-xs text-muted-foreground">Item total</Text>
                      <Text className="mt-1 text-sm text-foreground" mono weight="semibold">
                        {formatCurrency(getWorkItemFormTotal({ hourlyRate, workItem }), currencyCode)}
                      </Text>
                    </View>
                  </View>

                  <form.Field name={`workItems[${workItemIndex}].parts`} mode="array">
                    {(partsField) => (
                      <View className="gap-3 border-l-2 border-border pl-3">
                        <View className="flex-row items-center justify-between gap-3">
                          <Text className="text-sm text-foreground" weight="semibold">
                            Parts
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{ disabled: readOnly }}
                            className={`flex-row items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 ${
                              readOnly ? 'opacity-50' : 'active:bg-muted'
                            }`}
                            disabled={readOnly}
                            onPress={() => {
                              partsField.pushValue({ name: '', quantity: 1, unitPrice: 0 });
                              autosave.markChanged();
                            }}
                          >
                            <Icon className="text-primary" icon={IconPlus} size={14} />
                            <Text className="text-xs text-foreground" weight="semibold">
                              Add part
                            </Text>
                          </Pressable>
                        </View>
                        {partsField.state.value.length === 0 ? (
                          <Text className="text-xs text-muted-foreground">No parts.</Text>
                        ) : (
                          <View className="gap-3">
                            {partsField.state.value.map((part, partIndex) => (
                              <View
                                className="gap-3 rounded-xl border border-border bg-surface p-3"
                                key={getWorkItemPartKey(part)}
                              >
                                <form.AppField name={`workItems[${workItemIndex}].parts[${partIndex}].name`}>
                                  {(field) => (
                                    <field.TextField
                                      disabled={readOnly}
                                      label="Part name"
                                      onValueCommit={autosave.commit}
                                    />
                                  )}
                                </form.AppField>
                                <View className="gap-3 md:flex-row">
                                  <View className="flex-1">
                                    <form.AppField name={`workItems[${workItemIndex}].parts[${partIndex}].quantity`}>
                                      {(field) => (
                                        <field.NumberField
                                          disabled={readOnly}
                                          label="Quantity"
                                          onValueCommit={autosave.commit}
                                        />
                                      )}
                                    </form.AppField>
                                  </View>
                                  <View className="flex-1">
                                    <form.AppField name={`workItems[${workItemIndex}].parts[${partIndex}].unitPrice`}>
                                      {(field) => (
                                        <field.CurrencyField
                                          disabled={readOnly}
                                          label="Unit price"
                                          onValueCommit={autosave.commit}
                                        />
                                      )}
                                    </form.AppField>
                                  </View>
                                </View>
                                <View className="items-end">
                                  <Pressable
                                    accessibilityLabel={`Remove part ${partIndex + 1} from work item ${workItemIndex + 1}`}
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: readOnly }}
                                    className={`h-10 w-10 items-center justify-center rounded-lg ${
                                      readOnly ? 'opacity-0' : 'active:bg-muted'
                                    }`}
                                    disabled={readOnly}
                                    onPress={() => {
                                      partsField.removeValue(partIndex);
                                      autosave.commit();
                                    }}
                                  >
                                    <Icon className="text-danger" icon={IconTrash} size={17} />
                                  </Pressable>
                                </View>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </form.Field>

                  <View className="items-end border-t border-border pt-2">
                    <Pressable
                      accessibilityLabel={`Remove work item ${workItemIndex + 1}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: readOnly }}
                      className={`h-10 w-10 items-center justify-center rounded-lg ${
                        readOnly ? 'opacity-0' : 'active:bg-muted'
                      }`}
                      disabled={readOnly}
                      onPress={() => {
                        workItemsField.removeValue(workItemIndex);
                        autosave.commit();
                      }}
                    >
                      <Icon className="text-danger" icon={IconTrash} size={17} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </WorkItemsSection>
      )}
    </form.Field>
  );
}

function WorkItemsSection({ action, children }: { action: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="gap-4 rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-start justify-between gap-3">
        <Text className="text-[10px] uppercase tracking-[1.5px] text-muted-foreground" mono weight="semibold">
          Work items
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}
