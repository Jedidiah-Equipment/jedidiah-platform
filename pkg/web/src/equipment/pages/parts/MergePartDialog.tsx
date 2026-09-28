import { formatNumber } from '@pkg/domain';
import type { Part, PartMergePreview } from '@pkg/schema/equipment';
import { IconLoader2 } from '@tabler/icons-react';
import { skipToken, useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { EntityCombobox } from '@/components/common/EntityCombobox.js';
import { HelpLink } from '@/components/help/index.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
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
import { usePartSearchOptions } from '@/equipment/hooks/options/index.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { describePartMergeBlocker, formatPartMergeMoves, formatPartMergeStock } from './part-merge.js';

const partLabel = (part: Pick<Part, 'code' | 'name'>) => `${part.code} · ${part.name}`;

/** Merges the Part being edited — always the duplicate — into a survivor picked from the catalog. */
export const MergePartDialog: React.FC<{ onMerged: () => void; part: Part }> = ({ onMerged, part }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const showMutationError = useApiMutationErrorToast();
  const {
    invalidateAudit,
    invalidateInventory,
    invalidateJobs,
    invalidateParts,
    invalidateProducts,
    invalidatePurchaseOrders,
  } = useQueryInvalidation();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Part | null>(null);
  const [confirming, setConfirming] = useState(false);
  const options = usePartSearchOptions({ enabled: open && !confirming });
  const candidates = options.items.filter((candidate) => candidate.id !== part.id);
  const preview = useQuery(
    trpc.parts.mergePreview.queryOptions(
      open && confirming && target ? { sourceId: part.id, targetId: target.id } : skipToken,
    ),
  );
  const mergeMutation = useMutation(
    trpc.parts.merge.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to merge parts.'),
    }),
  );

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setTarget(null);
      setConfirming(false);
      options.setSearch('');
    }
  };

  const confirmMerge = async () => {
    if (!target) return;
    let merged: Part;
    try {
      merged = await mergeMutation.mutateAsync({ sourceId: part.id, targetId: target.id });
    } catch {
      return;
    }
    handleOpenChange(false);
    onMerged();
    toast.success(
      `${part.code} merged into ${merged.code}. Reprint the label for ${merged.code}; ${part.code} will no longer scan.`,
    );
    // Leave first: the preview names a Part that no longer exists, and an invalidation while it is
    // still mounted would refetch it into a 404.
    await navigate({ to: '/equipment/inventory/$partId', params: { partId: merged.id } });
    await Promise.all([
      invalidateParts(),
      invalidateInventory(),
      invalidatePurchaseOrders(),
      invalidateProducts(),
      invalidateJobs(),
      invalidateAudit(),
    ]);
  };

  const blocked = (preview.data?.blockers.length ?? 0) > 0;

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>Merge into…</DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {confirming ? 'Confirm part merge' : 'Merge part'}
            <HelpLink label="How to merge duplicate Parts" topic="partMerge" />
          </DialogTitle>
          <DialogDescription>
            {confirming
              ? 'Review what will move before permanently deleting this duplicate.'
              : `Choose the part that should survive ${part.code}.`}
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <MergePreviewBody error={preview.isError} preview={preview.data} />
        ) : (
          <Field>
            <FieldLabel htmlFor="part-merge-target">Merge into</FieldLabel>
            <EntityCombobox
              disabled={false}
              emptyMessage={options.isFetching ? 'Searching Parts...' : 'No other Parts found'}
              inputId="part-merge-target"
              inputValue={options.search}
              isFetching={options.isFetching}
              itemToLabel={partLabel}
              loadMore={{
                hasNextPage: options.hasNextPage,
                isFetchingNextPage: options.isFetchingNextPage,
                loadedCount: candidates.length,
                onLoadMore: options.loadMore,
                total: options.total - (options.items.length - candidates.length),
                totalLabel: (total) => `${formatNumber(total)} ${total === 1 ? 'Part' : 'Parts'}`,
              }}
              onInputValueChange={options.setSearch}
              onSelected={(selected) => {
                setTarget(selected);
                options.setSearch('');
              }}
              options={candidates}
              placeholder="Search by code or name"
              renderItem={partLabel}
              searchPlaceholder="Searching Parts..."
              value={target}
            />
          </Field>
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
              disabled={!preview.data || blocked || mergeMutation.isPending}
              onClick={() => void confirmMerge()}
              type="button"
              variant="destructive"
            >
              {mergeMutation.isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
              Merge part
            </Button>
          ) : (
            <Button disabled={!target} onClick={() => setConfirming(true)} type="button">
              Continue
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const MergePreviewBody: React.FC<{ error: boolean; preview: PartMergePreview | undefined }> = ({ error, preview }) => {
  if (!preview) {
    return <p className="text-sm">{error ? 'Unable to load the merge preview.' : 'Loading merge preview…'}</p>;
  }

  if (preview.blockers.length > 0) {
    return (
      <Alert variant="destructive">
        <AlertTitle>These parts cannot be merged yet</AlertTitle>
        <AlertDescription>
          <ul className="list-disc pl-4">
            {preview.blockers.map((blocker) => (
              <li key={blocker.kind === 'open-stocktake' ? `${blocker.kind}:${blocker.scope}` : blocker.kind}>
                {describePartMergeBlocker(blocker)}
              </li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <dl className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1">
        {formatPartMergeStock(preview).map((row) => (
          <div className="contents" key={row.label}>
            <dt className="font-medium">{row.label}</dt>
            <dd className="text-right tabular-nums">{row.onHand}</dd>
            <dd className="text-right text-muted-foreground tabular-nums">{row.average ?? ''}</dd>
          </div>
        ))}
      </dl>
      {preview.summed.length > 0 ? (
        <p>Quantities will be added together on {preview.summed.map((line) => line.label).join(', ')}.</p>
      ) : null}
      {preview.droppedBomLineCount > 0 ? (
        <p>
          {preview.source.code}’s own Bill of Materials will be dropped; {preview.target.code} keeps its own.
        </p>
      ) : null}
      <p>{formatPartMergeMoves(preview)}</p>
    </div>
  );
};
