import { hasPermission } from '@pkg/domain';
import type { UserAccount } from '@pkg/schema';
import { IconLoader2, IconUserCheck, IconUserOff } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { toast } from 'sonner';

import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { Button } from '@/components/ui/button.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { authClient } from '@/lib/auth-client.js';
import { useTRPC } from '@/lib/trpc.js';
import { unwrapAuthResult } from '../user-admin-client.js';
import { userAccountAction } from './user-account-action.js';

type UserAccountActionsProps = {
  user: UserAccount;
  /** After Disable or Enable, with the User's new state. */
  onDisabledChange: (disabled: boolean) => Promise<void>;
  onRemoved: () => Promise<void>;
};

/** Remove (no history), Disable (history) or Enable (disabled), through better-auth's own admin endpoints. */
export const UserAccountActions: React.FC<UserAccountActionsProps> = ({ user, onDisabledChange, onRemoved }) => {
  const trpc = useTRPC();
  const access = useAccess().data;
  const showMutationError = useApiMutationErrorToast();
  const canRemove = hasPermission(access, 'user:delete');
  const canDisable = hasPermission(access, 'user:ban');
  const isSelf = user.id === access?.userId;
  const removal = useQuery(
    trpc.users.removal.queryOptions({ userId: user.id }, { enabled: canRemove && !isSelf && !user.disabled }),
  );
  const action = userAccountAction({
    canDisable,
    canRemove,
    disabled: user.disabled,
    hasHistory: removal.data?.hasHistory,
    isSelf,
  });

  const removeMutation = useMutation({
    mutationFn: async () => unwrapAuthResult(await authClient.admin.removeUser({ userId: user.id })),
    onSuccess: async () => {
      await onRemoved();
      toast.success(`${user.name} removed`);
    },
    onError: (error) => showMutationError(error, 'Unable to remove user.'),
  });
  const setDisabledMutation = useMutation({
    mutationFn: async (disable: boolean) =>
      unwrapAuthResult(
        disable
          ? await authClient.admin.banUser({ userId: user.id })
          : await authClient.admin.unbanUser({ userId: user.id }),
      ),
    onSuccess: async (_result, disable) => {
      await onDisabledChange(disable);
      toast.success(disable ? `${user.name} disabled` : `${user.name} enabled`);
    },
    onError: (error, disable) =>
      showMutationError(error, disable ? 'Unable to disable user.' : 'Unable to enable user.'),
  });

  if (action === 'remove') {
    return (
      <RemoveEntityButton
        description={`${user.name} has no history, so the account is deleted permanently.`}
        isPending={removeMutation.isPending}
        onConfirm={() => removeMutation.mutate()}
        title={`Remove ${user.name}?`}
        triggerLabel="Remove user"
        triggerVariant="outline"
      />
    );
  }

  if (action === 'disable') {
    return (
      <RemoveEntityButton
        confirmLabel="Disable"
        description={`${user.name} will no longer be able to sign in or be picked anywhere. Their name stays on everything they have already done, and you can enable them again.`}
        isPending={setDisabledMutation.isPending}
        onConfirm={() => setDisabledMutation.mutate(true)}
        title={`Disable ${user.name}?`}
        triggerIcon={IconUserOff}
        triggerLabel="Disable user"
        triggerVariant="outline"
      />
    );
  }

  if (action === 'enable') {
    return (
      <Button
        disabled={setDisabledMutation.isPending}
        onClick={() => setDisabledMutation.mutate(false)}
        type="button"
        variant="outline"
      >
        {setDisabledMutation.isPending ? (
          <IconLoader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <IconUserCheck data-icon="inline-start" />
        )}
        Enable user
      </Button>
    );
  }

  return null;
};
