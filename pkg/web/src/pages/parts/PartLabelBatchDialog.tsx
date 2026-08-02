import { PartLabelBatchSelection, type PartLabelBatchSelection as PartLabelSelection } from '@pkg/schema';
import { IconPrinter } from '@tabler/icons-react';
import type React from 'react';
import { useMemo, useState } from 'react';

import { Button, type ButtonSize } from '@/components/ui/button.js';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from '@/components/ui/combobox.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { usePartCategoryOptions, usePartOptions, usePartStorageLocationOptions } from '@/hooks/options/index.js';
import { partLabelBatchUrl } from './part-label.js';

type BatchMode = PartLabelSelection['selection'];

type PartLabelBatchDialogProps = {
  buttonSize?: ButtonSize;
};

export const PartLabelBatchDialog: React.FC<PartLabelBatchDialogProps> = ({ buttonSize = 'default' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<BatchMode>('all');
  const [category, setCategory] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [partIds, setPartIds] = useState<string[]>([]);
  const categories = usePartCategoryOptions();
  const locations = usePartStorageLocationOptions();
  const parts = usePartOptions({ limit: 0 });
  const partLabels = useMemo(
    () => new Map(parts.items.map((part) => [part.id, `${part.code} · ${part.name}`])),
    [parts.items],
  );
  const selection = resolveSelection({ category, mode, partIds, storageLocation });

  const openDialog = () => {
    setMode('all');
    setCategory('');
    setStorageLocation('');
    setPartIds([]);
    setIsOpen(true);
  };

  return (
    <>
      <Button onClick={openDialog} size={buttonSize} variant="outline">
        <IconPrinter data-icon="inline-start" />
        Print labels
      </Button>
      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Print Part labels</DialogTitle>
            <DialogDescription>Generate one 100 × 50 mm label per selected Part.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field>
              <FieldLabel htmlFor="part-label-batch-mode">Parts to label</FieldLabel>
              <Select onValueChange={(value) => value && setMode(value as BatchMode)} value={mode}>
                <SelectTrigger className="w-full" id="part-label-batch-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parts</SelectItem>
                  <SelectItem value="category">By category</SelectItem>
                  <SelectItem value="storageLocation">By storage location</SelectItem>
                  <SelectItem value="ids">Choose Parts</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {mode === 'category' ? (
              <Field>
                <FieldLabel htmlFor="part-label-category">Category</FieldLabel>
                <Select onValueChange={(value) => setCategory(value ?? '')} value={category}>
                  <SelectTrigger className="w-full" id="part-label-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.items.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {mode === 'storageLocation' ? (
              <Field>
                <FieldLabel htmlFor="part-label-location">Storage location</FieldLabel>
                <Select onValueChange={(value) => setStorageLocation(value ?? '')} value={storageLocation}>
                  <SelectTrigger className="w-full" id="part-label-location">
                    <SelectValue placeholder="Select storage location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.items.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {mode === 'ids' ? (
              <Field>
                <FieldLabel htmlFor="part-label-parts">Parts</FieldLabel>
                <Combobox
                  items={parts.items.map((part) => part.id)}
                  itemToStringValue={(id) => partLabels.get(id) ?? id}
                  multiple
                  onValueChange={setPartIds}
                  value={partIds}
                >
                  <ComboboxChips>
                    <ComboboxValue>
                      {partIds.map((id) => (
                        <ComboboxChip key={id}>{partLabels.get(id) ?? id}</ComboboxChip>
                      ))}
                    </ComboboxValue>
                    <ComboboxChipsInput id="part-label-parts" placeholder="Search Parts…" />
                  </ComboboxChips>
                  <ComboboxContent>
                    <ComboboxEmpty>No Parts found.</ComboboxEmpty>
                    <ComboboxList>
                      {(id: string) => (
                        <ComboboxItem key={id} value={id}>
                          {partLabels.get(id) ?? id}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <FieldDescription>Each selected Part becomes one label page.</FieldDescription>
              </Field>
            ) : null}
          </div>
          <DialogFooter showCloseButton>
            {selection ? (
              <Button render={<a href={partLabelBatchUrl(selection)} rel="noreferrer" target="_blank" />}>
                <IconPrinter data-icon="inline-start" />
                Open printable PDF
              </Button>
            ) : (
              <Button disabled>
                <IconPrinter data-icon="inline-start" />
                Open printable PDF
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

function resolveSelection({
  category,
  mode,
  partIds,
  storageLocation,
}: {
  category: string;
  mode: BatchMode;
  partIds: string[];
  storageLocation: string;
}): PartLabelSelection | null {
  const candidate =
    mode === 'all'
      ? { selection: mode }
      : mode === 'category'
        ? { category, selection: mode }
        : mode === 'storageLocation'
          ? { selection: mode, storageLocation }
          : { ids: partIds, selection: mode };
  const parsed = PartLabelBatchSelection.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
