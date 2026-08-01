import { Field, FieldLabel } from '@/components/ui/field.js';

import type { StockPartOption } from './types.js';

export function StockPartSelect({
  onChange,
  parts,
  value,
}: {
  onChange: (partId: string) => void;
  parts: readonly StockPartOption[];
  value: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="inventory-movement-part">Part</FieldLabel>
      <select
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        id="inventory-movement-part"
        onChange={(event) => onChange(event.target.value)}
        required
        value={value}
      >
        {parts.map((part) => (
          <option key={part.partId} value={part.partId}>
            {part.partCode} · {part.partName}
          </option>
        ))}
      </select>
    </Field>
  );
}
