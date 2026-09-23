import { formatCurrency } from '@pkg/domain';
import {
  formatFreeStock,
  formatPlateWorking,
  proposeQuoteInventoryPartRow,
  quoteInventoryPartBasis,
  quoteInventoryPartLabel,
  quoteInventoryPartPriceNote,
  quoteInventoryPartQuantityLabel,
} from '@pkg/domain/equipment';
import {
  QuoteInventoryPartLengthMm,
  type QuoteInventoryPartOption,
  QuoteInventoryPartPlatePercent,
  QuoteWorkItemPartQuantity,
} from '@pkg/schema/equipment';
import { useState } from 'react';
import type { z } from 'zod';

import { EntityCombobox } from '@/components/common/EntityCombobox.js';
import { HelpLink } from '@/components/help/index.js';
import { Alert, AlertDescription } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { useQuoteInventoryPartOptions } from '@/equipment/hooks/options/index.js';
import type { QuoteWorkItemPartFormInput } from '../types.js';

type AddInventoryPartDialogProps = {
  currencyCode: string;
  onAdd: (row: QuoteWorkItemPartFormInput) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

/**
 * Pre-fills an ordinary Work Item Part row from a catalog Part. The row keeps no link to the Part:
 * every field stays editable, and a later cost or markup change never reaches it.
 */
export function AddInventoryPartDialog({ currencyCode, onAdd, onOpenChange, open }: AddInventoryPartDialogProps) {
  const options = useQuoteInventoryPartOptions({ enabled: open });
  const [part, setPart] = useState<QuoteInventoryPartOption | null>(null);
  const reset = () => {
    setPart(null);
    options.setSearch('');
  };
  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Add inventory part
            <HelpLink label="How to add an inventory part to a Quote" topic="quoteInventoryParts" />
          </DialogTitle>
          <DialogDescription>
            Fills in a part row from the Parts catalog. Nothing is reserved, and the row can be edited afterwards.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="quote-inventory-part-search">Part</FieldLabel>
          <EntityCombobox
            disabled={false}
            emptyMessage={options.isFetching ? 'Searching Parts...' : 'No Parts found'}
            inputId="quote-inventory-part-search"
            inputValue={options.search}
            isFetching={options.isFetching}
            itemToLabel={quoteInventoryPartLabel}
            loadMore={{
              hasNextPage: options.hasNextPage,
              isFetchingNextPage: options.isFetchingNextPage,
              loadedCount: options.items.length,
              onLoadMore: options.loadMore,
              total: options.total,
              totalLabel: (total) => `${total} ${total === 1 ? 'Part' : 'Parts'}`,
            }}
            onInputValueChange={options.setSearch}
            onSelected={(selected) => {
              setPart(selected);
              options.setSearch('');
            }}
            options={options.items}
            placeholder="Search by code, name, or Part Category"
            renderItem={renderPartOption}
            searchPlaceholder="Searching Parts..."
            value={part}
          />
        </Field>
        {part ? (
          <InventoryPartAmountForm
            currencyCode={currencyCode}
            key={part.id}
            onAdd={(row, { pickAnother }) => {
              onAdd(row);
              if (pickAnother) reset();
              else changeOpen(false);
            }}
            part={part}
          />
        ) : (
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InventoryPartAmountForm({
  currencyCode,
  onAdd,
  part,
}: {
  currencyCode: string;
  onAdd: (row: QuoteWorkItemPartFormInput, options: { pickAnother: boolean }) => void;
  part: QuoteInventoryPartOption;
}) {
  const basis = quoteInventoryPartBasis(part);
  const [lengthMm, setLengthMm] = useState(part.standardPurchaseLengthMm?.toString() ?? '');
  const [platePercent, setPlatePercent] = useState('');
  const [quantity, setQuantity] = useState('1');
  const length = parseNumber(QuoteInventoryPartLengthMm, lengthMm);
  const plate = parseNumber(QuoteInventoryPartPlatePercent, platePercent);
  const pieces = parseNumber(QuoteWorkItemPartQuantity, quantity);
  const row = proposeQuoteInventoryPartRow(part, {
    lengthMm: length.value,
    platePercent: plate.value,
    quantity: pieces.value,
  });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {basis === 'length' ? (
          <Field data-invalid={length.error !== null}>
            <FieldLabel htmlFor="quote-inventory-part-length">Length (mm)</FieldLabel>
            <Input
              aria-invalid={length.error !== null}
              id="quote-inventory-part-length"
              inputMode="numeric"
              min={1}
              onChange={(event) => setLengthMm(event.target.value)}
              step={1}
              type="number"
              value={lengthMm}
            />
            <FieldError>{length.error}</FieldError>
          </Field>
        ) : null}
        {basis === 'plate' ? (
          <Field data-invalid={plate.error !== null}>
            <FieldLabel htmlFor="quote-inventory-part-plate-percent">% of plate</FieldLabel>
            <Input
              aria-invalid={plate.error !== null}
              id="quote-inventory-part-plate-percent"
              inputMode="decimal"
              max={100}
              min={0}
              onChange={(event) => setPlatePercent(event.target.value)}
              step={0.01}
              type="number"
              value={platePercent}
            />
            {plate.value !== null && part.averageUtilizationPercent !== null ? (
              <FieldDescription>{formatPlateWorking(plate.value, part.averageUtilizationPercent)}</FieldDescription>
            ) : null}
            <FieldError>{plate.error}</FieldError>
          </Field>
        ) : null}
        <Field data-invalid={pieces.error !== null}>
          <FieldLabel htmlFor="quote-inventory-part-quantity">{quoteInventoryPartQuantityLabel(basis)}</FieldLabel>
          <Input
            aria-invalid={pieces.error !== null}
            id="quote-inventory-part-quantity"
            inputMode="numeric"
            min={1}
            onChange={(event) => setQuantity(event.target.value)}
            step={1}
            type="number"
            value={quantity}
          />
          <FieldError>{pieces.error}</FieldError>
        </Field>
      </div>
      {part.priceNote ? (
        <Alert>
          <AlertDescription>{quoteInventoryPartPriceNote(part, currencyCode)}</AlertDescription>
        </Alert>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
          <span className="font-medium">Unit price</span>
          <span className="tabular-nums">{row === null ? '—' : formatCurrency(row.unitPrice, currencyCode)}</span>
        </div>
      )}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button
          disabled={row === null}
          onClick={() => row && onAdd(row, { pickAnother: true })}
          type="button"
          variant="outline"
        >
          Add and pick another
        </Button>
        <Button disabled={row === null} onClick={() => row && onAdd(row, { pickAnother: false })} type="button">
          Add to work item
        </Button>
      </DialogFooter>
    </>
  );
}

/** An untouched empty box is not an error yet; it only keeps the add buttons disabled. */
function parseNumber(schema: z.ZodType<number>, text: string): { error: string | null; value: number | null } {
  if (text.trim() === '') return { error: null, value: null };

  const parsed = schema.safeParse(Number(text));
  return parsed.success
    ? { error: null, value: parsed.data }
    : { error: parsed.error.issues[0]?.message ?? 'Invalid value', value: null };
}

const renderPartOption = (part: QuoteInventoryPartOption) => (
  <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{quoteInventoryPartLabel(part)}</span>
      <span className="truncate text-muted-foreground text-xs">{part.partCategoryName}</span>
    </span>
    <span className={`shrink-0 text-xs ${part.freeQuantity > 0 ? 'tabular-nums' : 'text-muted-foreground'}`}>
      {formatFreeStock(part)}
    </span>
  </span>
);
