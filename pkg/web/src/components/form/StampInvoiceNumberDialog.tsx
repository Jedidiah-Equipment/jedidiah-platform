import { useDebouncedValue } from '@mantine/hooks';
import { InvoiceNumber } from '@pkg/schema';
import type React from 'react';
import { z } from 'zod';
import { CreateEntityDialog } from './CreateEntityDialog.js';

const StampInvoiceNumberValues = z.object({ invoiceNumber: InvoiceNumber });

/**
 * Asks for the Invoice Number an accounting invoice carries. One accounting invoice may cover several records,
 * so `renderAlsoOn` lists those already carrying the typed number: shown, never refused.
 */
export function StampInvoiceNumberDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  defaultInvoiceNumber = '',
  submit,
  onStamped,
  renderAlsoOn,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  defaultInvoiceNumber?: string;
  submit: (invoiceNumber: InvoiceNumber) => Promise<unknown>;
  onStamped: () => Promise<void> | void;
  renderAlsoOn: (invoiceNumber: InvoiceNumber) => React.ReactNode;
  /** What follows the field: the consequence of stamping and the write's refusal. */
  children?: React.ReactNode;
}) {
  return (
    <CreateEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      submitLabel={submitLabel}
      defaultValues={{ invoiceNumber: defaultInvoiceNumber }}
      validator={StampInvoiceNumberValues}
      onCreate={(values) => submit(values.invoiceNumber)}
      onCreated={async () => {
        onOpenChange(false);
        await onStamped();
      }}
    >
      {(form) => (
        <>
          <form.AppField name="invoiceNumber">
            {(field) => <field.TextField label="Invoice number" autoFocus className="font-mono" />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.invoiceNumber}>
            {(invoiceNumber) => <DebouncedAlsoOn invoiceNumber={invoiceNumber} renderAlsoOn={renderAlsoOn} />}
          </form.Subscribe>
          {children}
        </>
      )}
    </CreateEntityDialog>
  );
}

function DebouncedAlsoOn({
  invoiceNumber,
  renderAlsoOn,
}: {
  invoiceNumber: string;
  renderAlsoOn: (invoiceNumber: InvoiceNumber) => React.ReactNode;
}) {
  const [debounced] = useDebouncedValue(invoiceNumber.trim(), 300);
  const parsed = InvoiceNumber.safeParse(debounced);
  return parsed.success ? renderAlsoOn(parsed.data) : null;
}
