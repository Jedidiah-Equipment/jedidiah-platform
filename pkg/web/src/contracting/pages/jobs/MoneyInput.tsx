import { CURRENCY_SYMBOL_BY_CODE, PLANT_CURRENCY_CODE } from '@pkg/domain';
import { useEffect, useState } from 'react';
import {
  formatCurrencyFieldValue,
  formatCurrencyInputText,
  parseCurrencyFieldValue,
} from '@/components/form/fields/CurrencyField.js';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group.js';

const display = (value: number | null) => (value === null ? '' : formatCurrencyFieldValue(value, false));

/** An inline amount for table cells, rand by default: commits on blur or Enter, and an emptied input commits null. */
export function MoneyInput({
  value,
  onCommit,
  label,
  disabled = false,
  autoFocus = false,
  unit = CURRENCY_SYMBOL_BY_CODE[PLANT_CURRENCY_CODE],
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
  label: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** The addon beside the figure; a percentage Discount shows %. */
  unit?: string | undefined;
}) {
  const [text, setText] = useState(() => display(value));
  useEffect(() => setText(display(value)), [value]);
  const commit = () => {
    const parsed = parseCurrencyFieldValue(text, false);
    const next = Number.isNaN(parsed) ? null : Math.round(parsed * 100) / 100;
    if (next !== null && next < 0) {
      setText(display(value));
      return;
    }
    if (next !== value) onCommit(next);
    setText(display(next));
  };
  return (
    <InputGroup className="w-36">
      <InputGroupInput
        aria-label={label}
        autoFocus={autoFocus}
        disabled={disabled}
        inputMode="decimal"
        type="text"
        value={text}
        onChange={(event) => setText(formatCurrencyInputText(event.target.value))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <InputGroupAddon align="inline-start">
        <InputGroupText>{unit}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}
