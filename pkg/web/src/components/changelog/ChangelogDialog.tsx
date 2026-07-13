import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

import { ChangelogReleaseView } from './ChangelogReleaseView.js';
import {
  type ChangelogControl,
  type ChangelogDialogState,
  initialChangelogDialogState,
  primaryControlLabel,
  reduceChangelogControl,
} from './changelog-dialog-state.js';

export const ChangelogDialog: React.FC = () => {
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();

  // Load once per app load and never re-check: the dialog must not reappear on navigation or focus.
  const unseenQuery = useQuery(
    trpc.changelog.unseen.queryOptions(undefined, { refetchOnWindowFocus: false, staleTime: Number.POSITIVE_INFINITY }),
  );
  const markSeenMutation = useMutation(
    trpc.changelog.markSeen.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to record that you have seen these updates.'),
    }),
  );

  const [state, setState] = useState<ChangelogDialogState>(initialChangelogDialogState);
  const changelogs = unseenQuery.data ?? [];

  // Open once when unseen changelogs arrive. `dismissed` holds it closed across navigation after any
  // interaction; a full reload remounts this component and resets the state.
  useEffect(() => {
    if (!state.dismissed && unseenQuery.data && unseenQuery.data.length > 0) {
      setState((current) => (current.open ? current : { ...current, open: true }));
    }
  }, [unseenQuery.data, state.dismissed]);

  const safePageIndex = Math.min(state.pageIndex, changelogs.length - 1);
  const currentRelease = changelogs[safePageIndex];

  if (!currentRelease) {
    return null;
  }

  function applyControl(control: ChangelogControl) {
    const { state: nextState, markSeenReleasedAt } = reduceChangelogControl(
      { ...state, pageIndex: safePageIndex },
      control,
      changelogs,
    );
    setState(nextState);
    if (markSeenReleasedAt !== null) {
      markSeenMutation.mutate({ releasedAt: markSeenReleasedAt });
    }
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          applyControl('close');
        }
      }}
      open={state.open}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>What's new</DialogTitle>
        </DialogHeader>
        <ScrollArea className="-mx-4 min-h-0 flex-1 px-4">
          <ChangelogReleaseView changelog={currentRelease} />
        </ScrollArea>
        <DialogFooter className="shrink-0 items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {safePageIndex + 1} of {changelogs.length}
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => applyControl('skip')} variant="ghost">
              Skip
            </Button>
            <Button onClick={() => applyControl('primary')}>
              {primaryControlLabel(safePageIndex, changelogs.length)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
