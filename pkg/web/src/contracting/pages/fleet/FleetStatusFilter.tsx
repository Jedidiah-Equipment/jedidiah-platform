import type { FleetListInput } from '@pkg/schema/contracting';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
export function FleetStatusFilter({
  value,
  onChange,
}: {
  value: FleetListInput['status'];
  onChange: (value: FleetListInput['status']) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(value) => {
        if (value === 'active' || value === 'retired' || value === 'all') onChange(value);
      }}
    >
      <SelectTrigger aria-label="Fleet status">
        <SelectValue>{{ active: 'Active fleet', retired: 'Retired', all: 'All fleet' }[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="active">Active fleet</SelectItem>
        <SelectItem value="retired">Retired</SelectItem>
        <SelectItem value="all">All fleet</SelectItem>
      </SelectContent>
    </Select>
  );
}
