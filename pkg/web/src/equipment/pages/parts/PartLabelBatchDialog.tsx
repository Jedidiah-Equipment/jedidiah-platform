import { PartLabelBatchSelection } from '@pkg/schema/equipment';
import { IconPrinter } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';

import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { FilePreviewSheet } from '@/components/file-preview/FilePreviewSheet.js';
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import {
  usePartCategoryOptions,
  usePartOptions,
  usePartStorageLocationOptions,
} from '@/equipment/hooks/options/index.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { PartImportBatchList, PartImportBatchView, printableLabelCount } from './PartImportBatchPicker.js';
import {
  fetchPartLabelsBlob,
  type PartLabelBatchMode,
  type PartLabelUrlSelection,
  partLabelBatchModeLabels,
  partLabelBatchUrl,
} from './part-label.js';

type BatchMode = PartLabelBatchMode;

type PartLabelBatchPart = { code: string; id: string; name: string };

type PartLabelBatchDialogProps = {
  buttonSize?: ButtonSize;
  /** Parts to choose from when the page already holds them; omitted, the priced catalog is read instead. */
  parts?: readonly PartLabelBatchPart[];
};

export const PartLabelBatchDialog: React.FC<PartLabelBatchDialogProps> = ({ buttonSize = 'default', parts }) => {
  const [isOpen, setIsOpen] = useState(false);
  // A fresh key per opening starts every choice over, as the dialog always has.
  const [openCount, setOpenCount] = useState(0);

  return (
    <>
      <Button
        onClick={() => {
          setOpenCount((count) => count + 1);
          setIsOpen(true);
        }}
        size={buttonSize}
        variant="outline"
      >
        <IconPrinter data-icon="inline-start" />
        Print labels
      </Button>
      <PartLabelBatchPrintDialog key={openCount} onOpenChange={setIsOpen} open={isOpen} parts={parts} />
    </>
  );
};

type PartLabelBatchPrintDialogProps = {
  /** Opens straight onto one Part Import Batch, as the import's own shortcut does. */
  initialImportBatchId?: string | undefined;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts?: readonly PartLabelBatchPart[] | undefined;
};

export function PartLabelBatchPrintDialog({
  initialImportBatchId,
  onOpenChange,
  open,
  parts: pageParts,
}: PartLabelBatchPrintDialogProps) {
  const trpc = useTRPC();
  const [mode, setMode] = useState<BatchMode>(initialImportBatchId ? 'importBatch' : 'all');
  const [categoryId, setCategoryId] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [partIds, setPartIds] = useState<string[]>([]);
  const [importBatchId, setImportBatchId] = useState<string | null>(initialImportBatchId ?? null);
  const [includeUpdated, setIncludeUpdated] = useState(false);
  // Snapshotted when the preview opens, so choices changed behind the sheet don't re-render its PDF.
  const [previewSelection, setPreviewSelection] = useState<PartLabelBatchSelection | null>(null);
  const categories = usePartCategoryOptions();
  const locations = usePartStorageLocationOptions();
  const catalogParts = usePartOptions({ enabled: open && mode === 'ids' && !pageParts, limit: 0 });
  // Read on its own rather than from the page's Parts: a Part imported moments ago has no stock yet.
  const importBatchQuery = useQuery(
    trpc.parts.importBatch.queryOptions(
      { batchId: importBatchId ?? '' },
      { enabled: open && mode === 'importBatch' && importBatchId !== null },
    ),
  );
  const parts = pageParts ?? catalogParts.items;
  const partLabels = useMemo(() => new Map(parts.map((part) => [part.id, `${part.code} · ${part.name}`])), [parts]);
  const urlSelection = mode === 'importBatch' ? null : resolveSelection({ categoryId, mode, partIds, storageLocation });
  const importSelection: PartLabelBatchSelection | null =
    mode === 'importBatch' &&
    importBatchId !== null &&
    importBatchQuery.data &&
    printableLabelCount(importBatchQuery.data, includeUpdated) > 0
      ? { batchId: importBatchId, includeUpdated, selection: 'importBatch' }
      : null;
  const fetchBlob = useCallback(
    ({ signal }: { signal: AbortSignal }) =>
      previewSelection
        ? fetchPartLabelsBlob({ selection: previewSelection, signal })
        : Promise.reject(new Error('No Part label selection to render.')),
    [previewSelection],
  );

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className={mode === 'importBatch' ? 'sm:max-w-3xl' : 'sm:max-w-[560px]'}>
          <DialogHeader>
            <DialogTitle>Print Part labels</DialogTitle>
            <DialogDescription>Generate one 40 × 30 mm label per selected Part.</DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-4">
            <Field>
              <FieldLabel htmlFor="part-label-batch-mode">Parts to label</FieldLabel>
              <Select onValueChange={(value) => value && setMode(value as BatchMode)} value={mode}>
                <SelectTrigger className="w-full" id="part-label-batch-mode">
                  <SelectValue>{partLabelBatchModeLabels[mode]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{partLabelBatchModeLabels.all}</SelectItem>
                  <SelectItem value="category">{partLabelBatchModeLabels.category}</SelectItem>
                  <SelectItem value="storageLocation">{partLabelBatchModeLabels.storageLocation}</SelectItem>
                  <SelectItem value="ids">{partLabelBatchModeLabels.ids}</SelectItem>
                  <SelectItem value="importBatch">{partLabelBatchModeLabels.importBatch}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {mode === 'category' ? (
              <Field>
                <FieldLabel htmlFor="part-label-category">Part Category</FieldLabel>
                <SearchableCombobox
                  emptyMessage="No Part Categories found."
                  inputId="part-label-category"
                  onValueChange={setCategoryId}
                  options={categories.selectOptions}
                  placeholder="Search Part Categories"
                  value={categoryId}
                />
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
                  items={parts.map((part) => part.id)}
                  itemToStringLabel={(id) => partLabels.get(id) ?? id}
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
                    <ComboboxChipsInput id="part-label-parts" placeholder="Search parts…" />
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
            {mode === 'importBatch' ? (
              importBatchId === null ? (
                <PartImportBatchList
                  onSelect={(batchId) => {
                    setImportBatchId(batchId);
                    setIncludeUpdated(false);
                  }}
                />
              ) : (
                <PartImportBatchView
                  detail={importBatchQuery.data}
                  errorMessage={getApiQueryErrorMessage(importBatchQuery.error, 'Unable to load this import.')}
                  includeUpdated={includeUpdated}
                  isLoading={importBatchQuery.isPending}
                  onBack={() => setImportBatchId(null)}
                  onIncludeUpdatedChange={setIncludeUpdated}
                />
              )
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
            {mode === 'importBatch' ? (
              <Button disabled={!importSelection} onClick={() => setPreviewSelection(importSelection)} type="button">
                <IconPrinter data-icon="inline-start" />
                Open printable PDF
              </Button>
            ) : urlSelection ? (
              <Button render={<a href={partLabelBatchUrl(urlSelection)} rel="noreferrer" target="_blank" />}>
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
      <FilePreviewSheet
        description="Generated PDF"
        downloadFilename="part-labels.pdf"
        fetchBlob={fetchBlob}
        kind="pdf"
        onOpenChange={(sheetOpen) => {
          if (!sheetOpen) setPreviewSelection(null);
        }}
        open={previewSelection !== null}
        queryKey={['part-label-batch', previewSelection]}
        subject="Part labels"
        title="part-labels.pdf"
      />
    </>
  );
}

function resolveSelection({
  categoryId,
  mode,
  partIds,
  storageLocation,
}: {
  categoryId: string;
  mode: PartLabelUrlSelection['selection'];
  partIds: string[];
  storageLocation: string;
}): PartLabelUrlSelection | null {
  const candidate =
    mode === 'all'
      ? { selection: mode }
      : mode === 'category'
        ? { categoryId, selection: mode }
        : mode === 'storageLocation'
          ? { selection: mode, storageLocation }
          : { ids: partIds, selection: mode };
  const parsed = PartLabelBatchSelection.safeParse(candidate);
  return parsed.success && parsed.data.selection !== 'copies' && parsed.data.selection !== 'importBatch'
    ? parsed.data
    : null;
}
