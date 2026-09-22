import type { PartCategory, PartCategoryMergePreview } from '@pkg/schema/equipment';
import { PartCategoryMergeInput } from '@pkg/schema/equipment';
import { IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { HelpLink } from '@/components/help/index.js';
import { Button } from '@/components/ui/button.js';
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
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  formatPartCategoryMergeConfirmation,
  getPartCategoryMarkupWarnings,
  getPartCategoryMergeSourceOptions,
  getPartCategoryMergeTargetOptions,
} from './part-category-merge.js';

type MergePartCategoriesDialogProps = {
  /** Opened from a duplicate's own page: it starts as the one Part Category to merge away. */
  initialSourceId?: string;
  onMerged?: (survivor: PartCategory) => Promise<void>;
  triggerLabel: string;
};

export const MergePartCategoriesDialog: React.FC<MergePartCategoriesDialogProps> = ({
  initialSourceId,
  onMerged,
  triggerLabel,
}) => {
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const { invalidateAudit, invalidatePartCategories, invalidateParts } = useQueryInvalidation();
  const initialSourceIds = initialSourceId ? [initialSourceId] : [];
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [sourceIds, setSourceIds] = useState<string[]>(initialSourceIds);
  const [confirming, setConfirming] = useState(false);
  const categories = useQuery(trpc.partCategories.list.queryOptions(undefined, { enabled: open }));
  const items = categories.data ?? [];
  const listUnavailable = categories.isPending || categories.isError;
  const names = useMemo(() => new Map(items.map((category) => [category.id, category.name])), [items]);
  const labelFor = (id: string) => names.get(id) ?? id;
  const targetOptions = useMemo(() => getPartCategoryMergeTargetOptions(items), [items]);
  const sourceOptions = useMemo(() => getPartCategoryMergeSourceOptions(items, targetId), [items, targetId]);
  const input = { sourceIds, targetId };
  const isValid = PartCategoryMergeInput.safeParse(input).success;
  const preview = useQuery(
    trpc.partCategories.mergePreview.queryOptions(input, { enabled: open && confirming && isValid }),
  );
  const mergeMutation = useMutation(
    trpc.partCategories.merge.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to merge Part Categories.'),
    }),
  );

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setTargetId('');
      setSourceIds(initialSourceIds);
      setConfirming(false);
    }
  };

  const chooseTarget = (nextTargetId: string) => {
    setTargetId(nextTargetId);
    setSourceIds((current) => current.filter((id) => id !== nextTargetId));
  };

  const confirmMerge = async () => {
    let survivor: PartCategory;
    try {
      survivor = await mergeMutation.mutateAsync(input);
    } catch {
      return;
    }
    // Leave before invalidating: the preview, and a duplicate's own page, name categories that no longer exist.
    handleOpenChange(false);
    toast.success(`Merged into ${survivor.name}`);
    await onMerged?.(survivor);
    await Promise.all([invalidatePartCategories(), invalidateParts(), invalidateAudit()]);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>{triggerLabel}</DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {confirming ? 'Confirm Part Category merge' : 'Merge Part Categories'}
            <HelpLink label="How to merge duplicate Part Categories" topic="partCategoryMerge" />
          </DialogTitle>
          <DialogDescription>
            {confirming
              ? 'Review what will move before the duplicates are deleted.'
              : 'Choose the Part Category to keep, then the duplicates whose Parts move into it.'}
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <MergePreview error={preview.error} preview={preview.data} />
        ) : (
          <div className="grid gap-4">
            <ErrorMessage error={categories.error} fallbackMessage="Unable to load Part Categories." />
            <Field>
              <FieldLabel htmlFor="part-category-merge-target">Keep</FieldLabel>
              <SearchableCombobox
                disabled={listUnavailable}
                emptyMessage="No Part Categories found."
                inputId="part-category-merge-target"
                onValueChange={chooseTarget}
                options={targetOptions}
                placeholder="Search Part Categories"
                value={targetId}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="part-category-merge-sources">Merge into it</FieldLabel>
              <Combobox
                disabled={listUnavailable}
                items={sourceOptions.map((option) => option.value)}
                itemToStringLabel={labelFor}
                multiple
                onValueChange={setSourceIds}
                value={sourceIds}
              >
                <ComboboxChips>
                  <ComboboxValue>
                    {sourceIds.map((id) => (
                      <ComboboxChip key={id}>{labelFor(id)}</ComboboxChip>
                    ))}
                  </ComboboxValue>
                  <ComboboxChipsInput id="part-category-merge-sources" placeholder="Search duplicates…" />
                </ComboboxChips>
                <ComboboxContent>
                  <ComboboxEmpty>No other Part Categories found.</ComboboxEmpty>
                  <ComboboxList>
                    {(id: string) => (
                      <ComboboxItem key={id} value={id}>
                        {labelFor(id)}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </Field>
          </div>
        )}

        <DialogFooter>
          {confirming ? (
            <Button
              disabled={mergeMutation.isPending}
              onClick={() => setConfirming(false)}
              type="button"
              variant="outline"
            >
              Back
            </Button>
          ) : (
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          )}
          {confirming ? (
            <Button
              disabled={!preview.data || mergeMutation.isPending}
              onClick={() => void confirmMerge()}
              type="button"
              variant="destructive"
            >
              {mergeMutation.isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
              Merge
            </Button>
          ) : (
            <Button disabled={!isValid} onClick={() => setConfirming(true)} type="button">
              Continue
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function MergePreview({ error, preview }: { error: unknown; preview: PartCategoryMergePreview | undefined }) {
  if (!preview) {
    return <p className="text-sm">{error ? 'Unable to load the merge counts.' : 'Loading merge counts…'}</p>;
  }

  const warnings = getPartCategoryMarkupWarnings(preview);

  return (
    <div className="grid gap-3 text-sm">
      <ul className="grid gap-1">
        {preview.sources.map((source) => (
          <MergePreviewRow category={source} key={source.id} outcome="Deleted" />
        ))}
        <MergePreviewRow category={preview.target} outcome="Kept" />
      </ul>
      <p>{formatPartCategoryMergeConfirmation(preview)}</p>
      {warnings.map((warning) => (
        <p className="text-warning" key={warning}>
          {warning}
        </p>
      ))}
    </div>
  );
}

function MergePreviewRow({ category, outcome }: { category: PartCategory; outcome: 'Deleted' | 'Kept' }) {
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span>
        <span className="font-medium">{category.name}</span> <span className="text-muted-foreground">({outcome})</span>
      </span>
      <span className="text-muted-foreground tabular-nums">
        {category.partCount} {category.partCount === 1 ? 'Part' : 'Parts'} ·{' '}
        {category.markupPercent === null ? 'No markup' : `${category.markupPercent}% markup`}
      </span>
    </li>
  );
}
