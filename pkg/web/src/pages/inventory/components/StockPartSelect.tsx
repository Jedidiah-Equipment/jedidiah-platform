import { Field, FieldLabel } from '@/components/ui/field.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';

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
  const selectedPart = parts.find((part) => part.partId === value);

  return (
    <Field>
      <FieldLabel htmlFor="inventory-movement-part">Part</FieldLabel>
      <Select onValueChange={(partId) => onChange(String(partId))} value={value}>
        <SelectTrigger className="w-full" id="inventory-movement-part">
          <SelectValue placeholder="Select Part">
            {selectedPart ? `${selectedPart.partCode} · ${selectedPart.partName}` : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start">
          <SelectGroup>
            {parts.map((part) => (
              <SelectItem key={part.partId} value={part.partId}>
                {part.partCode} · {part.partName}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
