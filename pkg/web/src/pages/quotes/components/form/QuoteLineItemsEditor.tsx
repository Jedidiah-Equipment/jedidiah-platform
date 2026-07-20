import { createStableRowKeys, formatCurrency } from '@pkg/domain';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type React from 'react';
import { useTypedAppFormContext } from '@/components/form/index.js';
import type { ArrayFieldApi } from '@/components/form/types.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { emptyQuoteFormValues, type QuoteFormValues } from '../types.js';

type QuoteLineItemFormInput = QuoteFormValues['lineItems'][number];

type QuoteLineItemsEditorProps = {
  currencyCode: string;
  lineItemsField: ArrayFieldApi<QuoteLineItemFormInput>;
  onRemoveLineItem: () => void;
  readOnly: boolean;
};

const DEFAULT_LINE_ITEM: QuoteLineItemFormInput = {
  name: '',
  quantity: 1,
  unitPrice: 0,
};

const getLineItemKey = createStableRowKeys<QuoteLineItemFormInput>('quote-line-item');

function useQuoteForm() {
  return useTypedAppFormContext({
    defaultValues: emptyQuoteFormValues,
  });
}

export const QuoteLineItemsEditor: React.FC<QuoteLineItemsEditorProps> = ({
  currencyCode,
  lineItemsField,
  onRemoveLineItem,
  readOnly,
}) => {
  const quoteForm = useQuoteForm();
  const lineItems = lineItemsField.state.value;

  return (
    <div className="grid gap-3">
      {lineItems.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-4 text-muted-foreground text-sm">No line items.</div>
      ) : (
        <div className="grid gap-2">
          {lineItems.map((lineItem, index) => (
            <div
              className="grid gap-3 rounded-md border bg-muted/10 p-3 md:grid-cols-[minmax(0,1fr)_7rem_10rem_10rem_auto]"
              key={getLineItemKey(lineItem)}
            >
              <quoteForm.AppField name={`lineItems[${index}].name`}>
                {(field) => <field.TextField autoComplete="off" disabled={readOnly} label="Name" />}
              </quoteForm.AppField>
              <quoteForm.AppField name={`lineItems[${index}].quantity`}>
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
              <quoteForm.AppField name={`lineItems[${index}].unitPrice`}>
                {(field) => <field.CurrencyField currencyCode={currencyCode} disabled={readOnly} label="Unit price" />}
              </quoteForm.AppField>
              <div className="grid gap-2">
                <span className="font-medium text-sm leading-snug">Total</span>
                <span className="flex h-8 items-center rounded-md border bg-background px-2.5 text-sm tabular-nums">
                  {formatCurrency(getLineItemTotal(lineItem), currencyCode)}
                </span>
              </div>
              <div className="flex items-end justify-end">
                <Button
                  aria-label={`Remove line item ${index + 1}`}
                  className={cn('mb-0.5', readOnly ? 'invisible' : '')}
                  disabled={readOnly}
                  onClick={() => {
                    lineItemsField.removeValue(index);
                    onRemoveLineItem();
                  }}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <IconTrash />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const QuoteAddLineItemButton: React.FC<Pick<QuoteLineItemsEditorProps, 'lineItemsField' | 'readOnly'>> = ({
  lineItemsField,
  readOnly,
}) => (
  <Button
    disabled={readOnly}
    onClick={() => lineItemsField.pushValue({ ...DEFAULT_LINE_ITEM })}
    size="sm"
    type="button"
    variant="outline"
  >
    <IconPlus data-icon="inline-start" />
    Add line item
  </Button>
);

function getLineItemTotal(lineItem: QuoteLineItemFormInput): number {
  return Number.isFinite(lineItem.quantity) && Number.isFinite(lineItem.unitPrice)
    ? lineItem.quantity * lineItem.unitPrice
    : 0;
}
