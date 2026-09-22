import type { PartCategory } from '@pkg/schema/equipment';
import { useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { PartCategoryCreateDialog } from '@/equipment/pages/part-categories/PartCategoryCreateDialog.js';
import { useCan } from '@/hooks/use-access.js';

/** Beside a Part's picker, for the people who manage Part Categories; everyone else picks from the list. */
export function NewPartCategoryButton({ onCreated }: { onCreated: (category: PartCategory) => void }) {
  const [open, setOpen] = useState(false);
  const canManage = useCan('equipment_part_category:update').can;

  if (!canManage) return null;

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" type="button" variant="outline">
        New category
      </Button>
      <PartCategoryCreateDialog onCreated={onCreated} onOpenChange={setOpen} open={open} />
    </>
  );
}
