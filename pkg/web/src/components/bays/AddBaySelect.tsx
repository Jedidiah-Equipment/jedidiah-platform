import { departmentLabels } from '@pkg/domain';
import type { Bay, UUID } from '@pkg/schema';
import { IconPlus } from '@tabler/icons-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { cn } from '@/lib/utils.js';
import { bayOperatorName } from './bay-label.js';
import { sortBaysByDepartmentPipeline } from './sort-bays.js';

type AddBaySelectProps = {
  bays: Bay[];
  className?: string;
  disabled?: boolean;
  excludeBayIds?: ReadonlySet<UUID>;
  onAdd: (bay: Bay) => void;
};

export const AddBaySelect: React.FC<AddBaySelectProps> = ({ bays, className, disabled, excludeBayIds, onAdd }) => {
  const [selectedAddBayId, setSelectedAddBayId] = useState('');
  const availableBays = useMemo(
    () => sortBaysByDepartmentPipeline(excludeBayIds ? bays.filter((bay) => !excludeBayIds.has(bay.id)) : bays),
    [bays, excludeBayIds],
  );
  const selectedAddBay = availableBays.find((bay) => bay.id === selectedAddBayId);
  const handleAddBay = () => {
    if (!selectedAddBay) {
      return;
    }

    onAdd(selectedAddBay);
    setSelectedAddBayId('');
  };

  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end', className)}>
      <Select disabled={disabled} onValueChange={(value) => setSelectedAddBayId(value ?? '')} value={selectedAddBayId}>
        <SelectTrigger className="w-full sm:w-72">
          <SelectValue placeholder={availableBays.length === 0 ? 'No Bays available' : 'Select Bay'}>
            {selectedAddBay
              ? `${selectedAddBay.name} - ${bayOperatorName(selectedAddBay) ?? departmentLabels[selectedAddBay.department]}`
              : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {availableBays.map((bay) => (
              <SelectItem key={bay.id} value={bay.id}>
                {bay.name} - {bayOperatorName(bay) ?? departmentLabels[bay.department]}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button disabled={disabled || !selectedAddBay} onClick={handleAddBay} type="button" variant="outline">
        <IconPlus data-icon="inline-start" />
        Add
      </Button>
    </div>
  );
};
