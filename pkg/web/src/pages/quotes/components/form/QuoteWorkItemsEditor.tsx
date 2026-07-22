import { createStableRowKeys, formatCurrency, getWorkItemFormTotal } from '@pkg/domain';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type React from 'react';
import { useTypedAppFormContext } from '@/components/form/index.js';
import type { ArrayFieldApi } from '@/components/form/types.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { emptyQuoteFormValues, type QuoteFormValues } from '../types.js';

type QuoteWorkItemFormInput = QuoteFormValues['workItems'][number];

type QuoteWorkItemsEditorProps = {
  currencyCode: string;
  hourlyRate: number;
  onRemoveWorkItem: () => void;
  readOnly: boolean;
  workItemsField: ArrayFieldApi<QuoteWorkItemFormInput>;
};

const DEFAULT_WORK_ITEM: QuoteWorkItemFormInput = { hours: 0, name: '', parts: [] };
const DEFAULT_WORK_ITEM_PART: QuoteWorkItemFormInput['parts'][number] = { name: '', quantity: 1, unitPrice: 0 };
const getWorkItemKey = createStableRowKeys<QuoteWorkItemFormInput>('quote-work-item');
const getWorkItemPartKey = createStableRowKeys<QuoteWorkItemFormInput['parts'][number]>('quote-work-item-part');

function useQuoteForm() {
  return useTypedAppFormContext({ defaultValues: emptyQuoteFormValues });
}

export const QuoteWorkItemsEditor: React.FC<QuoteWorkItemsEditorProps> = ({
  currencyCode,
  hourlyRate,
  onRemoveWorkItem,
  readOnly,
  workItemsField,
}) => {
  const quoteForm = useQuoteForm();
  const workItems = workItemsField.state.value;

  return (
    <div className="grid gap-3">
      {workItems.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-4 text-muted-foreground text-sm">No work items.</div>
      ) : (
        workItems.map((workItem, workItemIndex) => (
          <div className="grid gap-4 rounded-md border bg-muted/10 p-3" key={getWorkItemKey(workItem)}>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_10rem_auto]">
              <quoteForm.AppField name={`workItems[${workItemIndex}].name`}>
                {(field) => <field.TextField autoComplete="off" disabled={readOnly} label="Work item" />}
              </quoteForm.AppField>
              <quoteForm.AppField name={`workItems[${workItemIndex}].hours`}>
                {(field) => (
                  <field.NumberField
                    decimals={2}
                    disabled={readOnly}
                    emptyValue={Number.NaN}
                    label="Hours"
                    min={0}
                    step="0.01"
                  />
                )}
              </quoteForm.AppField>
              <div className="grid gap-2">
                <span className="font-medium text-sm leading-snug">Total</span>
                <span className="flex h-8 items-center rounded-md border bg-background px-2.5 text-sm tabular-nums">
                  {formatCurrency(getWorkItemFormTotal({ hourlyRate, workItem }), currencyCode)}
                </span>
              </div>
              <div className="flex items-end justify-end">
                <Button
                  aria-label={`Remove work item ${workItemIndex + 1}`}
                  className={cn('mb-0.5', readOnly ? 'invisible' : '')}
                  disabled={readOnly}
                  onClick={() => {
                    workItemsField.removeValue(workItemIndex);
                    onRemoveWorkItem();
                  }}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <IconTrash />
                </Button>
              </div>
            </div>

            <quoteForm.Field name={`workItems[${workItemIndex}].parts`} mode="array">
              {(partsField) => (
                <div className="grid gap-2 border-l-2 pl-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm">Parts</span>
                    <Button
                      disabled={readOnly}
                      onClick={() => partsField.pushValue({ ...DEFAULT_WORK_ITEM_PART })}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      <IconPlus data-icon="inline-start" />
                      Add part
                    </Button>
                  </div>
                  {partsField.state.value.length === 0 ? (
                    <span className="text-muted-foreground text-xs">No parts.</span>
                  ) : (
                    partsField.state.value.map((part, partIndex) => (
                      <div
                        className="grid gap-2 md:grid-cols-[minmax(0,1fr)_7rem_10rem_auto]"
                        key={getWorkItemPartKey(part)}
                      >
                        <quoteForm.AppField name={`workItems[${workItemIndex}].parts[${partIndex}].name`}>
                          {(field) => <field.TextField autoComplete="off" disabled={readOnly} label="Part name" />}
                        </quoteForm.AppField>
                        <quoteForm.AppField name={`workItems[${workItemIndex}].parts[${partIndex}].quantity`}>
                          {(field) => (
                            <field.NumberField
                              disabled={readOnly}
                              emptyValue={Number.NaN}
                              inputMode="numeric"
                              label="Qty"
                              min={1}
                              step="1"
                            />
                          )}
                        </quoteForm.AppField>
                        <quoteForm.AppField name={`workItems[${workItemIndex}].parts[${partIndex}].unitPrice`}>
                          {(field) => (
                            <field.CurrencyField currencyCode={currencyCode} disabled={readOnly} label="Unit price" />
                          )}
                        </quoteForm.AppField>
                        <div className="flex items-end justify-end">
                          <Button
                            aria-label={`Remove part ${partIndex + 1} from work item ${workItemIndex + 1}`}
                            className={cn('mb-0.5', readOnly ? 'invisible' : '')}
                            disabled={readOnly}
                            onClick={() => {
                              partsField.removeValue(partIndex);
                              onRemoveWorkItem();
                            }}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <IconTrash />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </quoteForm.Field>
          </div>
        ))
      )}
    </div>
  );
};

export const QuoteAddWorkItemButton: React.FC<Pick<QuoteWorkItemsEditorProps, 'readOnly' | 'workItemsField'>> = ({
  readOnly,
  workItemsField,
}) => (
  <Button
    disabled={readOnly}
    onClick={() => workItemsField.pushValue({ ...DEFAULT_WORK_ITEM })}
    size="sm"
    type="button"
    variant="outline"
  >
    <IconPlus data-icon="inline-start" />
    Add work item
  </Button>
);
