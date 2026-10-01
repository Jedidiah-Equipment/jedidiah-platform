import { formatDate } from '@pkg/domain';
import type { CustomerPossibleMatch } from '@pkg/schema/equipment';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { HelpLink } from '@/components/help/index.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

/** Pauses creation until the user chooses an existing Customer or explicitly creates another. */
export function useCustomerMatchChoice() {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const queryClient = useQueryClient();
  const [matches, setMatches] = useState<CustomerPossibleMatch[]>([]);
  const resolve = useRef<((choice: CustomerPossibleMatch | 'create' | null) => void) | null>(null);
  useEffect(
    () => () => {
      resolve.current?.(null);
    },
    [],
  );
  const finish = (choice: CustomerPossibleMatch | 'create' | null) => {
    resolve.current?.(choice);
    resolve.current = null;
    setMatches([]);
  };
  const choose = async (companyName: string) => {
    // Always read at submission: a cached match list must not silently create a duplicate.
    const found = await queryClient
      .fetchQuery({ ...trpc.customers.findPossibleMatches.queryOptions({ companyName }), staleTime: 0 })
      .catch((error: unknown) => {
        showError(error, 'Unable to check possible Customer matches.');
        throw error;
      });
    if (!found.length) return 'new' as const;
    setMatches(found);
    return new Promise<CustomerPossibleMatch | 'create' | null>((done) => {
      resolve.current = done;
    });
  };
  const dialog = (
    <Dialog
      open={matches.length > 0}
      onOpenChange={(open) => {
        if (!open) finish(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Possible Customer match</DialogTitle>
          <DialogDescription>
            Use an existing Customer, or create another if this is a different company.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <ScrollArea className="max-h-[50vh]">
            <div className="grid gap-3">
              {matches.map((match) => (
                <div key={match.id} className="grid gap-2 rounded-md border p-3">
                  <p>
                    Possible match: {match.companyName}
                    {match.contactPerson ? ` (${match.contactPerson})` : ''} — use it instead?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {match.email ? `${match.email} · ` : ''}Created {formatDate(match.createdAt, 'medium')}
                  </p>
                  <Button type="button" variant="outline" onClick={() => finish(match)}>
                    Use this Customer
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
          <HelpLink topic="customerCreate" label="How to choose a Customer" />
          <Button type="button" onClick={() => finish('create')}>
            Create anyway
          </Button>
          <Button type="button" variant="outline" onClick={() => finish(null)}>
            Go back
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
  return { choose, dialog };
}
