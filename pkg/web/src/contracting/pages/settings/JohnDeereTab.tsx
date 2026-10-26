import { formatDate, getFirstName } from '@pkg/domain';
import type { JohnDeereConnectionView, JohnDeereConnectResult } from '@pkg/schema/contracting';
import { IconLoader2, IconPlugConnectedX } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

const RESULT_TOAST_ID = 'john-deere-connect-result';

const showResult: Record<JohnDeereConnectResult, () => void> = {
  connected: () => toast.success('John Deere connected', { id: RESULT_TOAST_ID }),
  'not-connected': () =>
    toast.warning('John Deere is not connected: no organization gave Jedidiah access.', { id: RESULT_TOAST_ID }),
  error: () => toast.error('John Deere could not be connected. Try again.', { id: RESULT_TOAST_ID }),
};

type JohnDeereTabProps = { result: JohnDeereConnectResult | undefined; onResultShown: () => void };

export function JohnDeereTab({ result, onResultShown }: JohnDeereTabProps) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingJohnDeere.status.queryOptions());

  useEffect(() => {
    if (!result) return;
    showResult[result]();
    onResultShown();
  }, [result, onResultShown]);

  if (query.isPending) return <Skeleton className="h-48 w-full" />;
  if (query.error)
    return <ErrorMessage error={query.error} fallbackMessage="Unable to load the John Deere Connection." />;
  return <ConnectionCard connection={query.data} />;
}

function ConnectionCard({ connection }: { connection: JohnDeereConnectionView }) {
  if (!connection.configured)
    return (
      <StatusCard
        title="Not configured"
        description="This environment has no John Deere application keys. Set JOHN_DEERE_CLIENT_ID, JOHN_DEERE_CLIENT_SECRET and JOHN_DEERE_TOKEN_KEY on the API and restart it to connect."
      />
    );
  if (connection.status === 'connected') return <ConnectedCard connection={connection} />;
  if (connection.status === 'needs-reconnect')
    return (
      <StatusCard
        title="Needs reconnecting"
        description={connection.lastError ?? 'John Deere no longer accepts the connection.'}
        action="Reconnect"
      />
    );
  return (
    <StatusCard
      title="Not connected"
      description="Connect signs in to John Deere with the owner's login and picks the Operations Center organization whose machines report their engine hours here."
      action="Connect"
    />
  );
}

function StatusCard({ title, description, action }: { title: string; description: string; action?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {action ? (
        <CardFooter className="justify-end">
          <ConnectButton label={action} />
        </CardFooter>
      ) : null}
    </Card>
  );
}

function ConnectedCard({ connection }: { connection: JohnDeereConnectionView }) {
  const trpc = useTRPC();
  const { invalidateJohnDeere } = useQueryInvalidation();
  const write = useContractingWrite(invalidateJohnDeere);
  const disconnect = useMutation(
    trpc.contractingJohnDeere.disconnect.mutationOptions(write.card('Unable to disconnect John Deere.')),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected</CardTitle>
        <CardDescription>
          {connection.organizations.map((organization) => organization.name).join(', ')}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-1 text-sm">
        {connection.connectedBy && connection.connectedAt ? (
          <p>
            Connected by {getFirstName(connection.connectedBy.name)} on {formatDate(connection.connectedAt, 'medium')}
          </p>
        ) : null}
        <p className="text-muted-foreground">
          Last poll: <DateDisplay date={connection.lastPolledAt} emptyValue="not yet" />
        </p>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <RemoveEntityButton
          confirmLabel="Disconnect"
          description="Jedidiah forgets the John Deere sign-in and every feed pauses until someone connects again. Links and the readings already stored stay."
          isPending={disconnect.isPending}
          onConfirm={() => disconnect.mutate()}
          title="Disconnect John Deere?"
          triggerIcon={IconPlugConnectedX}
          triggerLabel="Disconnect"
          triggerVariant="outline"
        />
        <ConnectButton label="Reconnect" />
      </CardFooter>
    </Card>
  );
}

/** Starts the OAuth round trip; the browser leaves for John Deere and returns to this tab. */
function ConnectButton({ label }: { label: string }) {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const start = useMutation(
    trpc.contractingJohnDeere.connect.start.mutationOptions({
      onSuccess: ({ url }) => window.location.assign(url),
      onError: (error) => showError(error, 'Unable to start the John Deere sign-in.'),
    }),
  );
  // Stays pending through the navigation away, so a second press cannot open a second round trip.
  const busy = start.isPending || start.isSuccess;
  return (
    <Button disabled={busy} onClick={() => start.mutate()} type="button">
      {busy ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
      {label}
    </Button>
  );
}
