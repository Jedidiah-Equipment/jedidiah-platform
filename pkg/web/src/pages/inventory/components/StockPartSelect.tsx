import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
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
      <SearchableCombobox
        emptyMessage="No Parts found."
        inputId="inventory-movement-part"
        onValueChange={onChange}
        options={parts.map((part) => ({
          label: `${part.partCode} · ${part.partName}`,
          value: part.partId,
        }))}
        placeholder="Search Parts"
        value={value}
      />
    </Field>
  );
}
