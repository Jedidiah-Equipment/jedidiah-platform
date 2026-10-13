import {
  createUserAccessSummaryForUser,
  groupBy,
  PUSH_KINDS,
  pushKindsFor,
  statusBadgeColorClassNames,
} from '@pkg/domain';
import type { PushKind, PushPreferences } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RefreshControl } from '@/components/ui/refresh-control';
import { StatusBadge } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { useAuthSession } from '@/lib/auth-session';
import { BUSINESS_LABELS } from '@/lib/business-home';
import { useTRPC } from '@/lib/trpc';
import type { AppPermissionRow } from './app-permission-rows';
import { useAppPermissions } from './use-app-permissions';

// Opened from the profile menu over whichever screen the person was on, so Back returns there; a reload on mobile
// web leaves no history, and the business home is the way out.
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** App Settings: the OS permissions the app uses, and the Push Kinds this person can mute. Belongs to neither business. */
export default function SettingsScreen() {
  const { user } = useAuthSession();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="Settings"
        subtitle={user.email}
        parentLabel="Back"
        onBack={leave}
        helpTopic="appSettings"
      />
      <ScrollView
        contentContainerStyle={{ ...SECONDARY_PAGE_CONTENT_STYLE, gap: 16 }}
        refreshControl={<RefreshControl />}
      >
        <PermissionsCard />
        <NotificationsCard />
      </ScrollView>
    </SafeAreaView>
  );
}

function PermissionsCard() {
  const { rows, ask, openSettings } = useAppPermissions();
  if (rows.length === 0) return null;

  return (
    <Card title="Permissions">
      {rows.map((row) => (
        <PermissionRow
          key={row.key}
          row={row}
          onAction={() => void (row.action === 'allow' ? ask(row.key) : openSettings())}
        />
      ))}
    </Card>
  );
}

function PermissionRow({ row, onAction }: { row: AppPermissionRow; onAction: () => void }) {
  return (
    <View className="gap-2 border-t border-border pt-3">
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text className="text-sm text-foreground" weight="semibold">
            {row.label}
          </Text>
          <Text className="text-xs text-muted-foreground">{row.description}</Text>
        </View>
        <StatusBadge classNames={statusBadgeColorClassNames[row.statusColor]} label={row.statusLabel} />
      </View>
      {row.action ? <Button title={row.action === 'allow' ? 'Allow' : 'Open Settings'} onPress={onAction} /> : null}
    </View>
  );
}

function NotificationsCard() {
  const { user } = useAuthSession();
  const kinds = useMemo(() => pushKindsFor(createUserAccessSummaryForUser(user)), [user]);
  const groups = useMemo(() => [...groupBy(kinds, (kind) => PUSH_KINDS[kind].business)], [kinds]);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showToast = useAppToast();
  const preferencesKey = trpc.pushPreferences.get.queryKey();
  const preferences = useQuery(trpc.pushPreferences.get.queryOptions(undefined, { enabled: kinds.length > 0 }));
  const save = useMutation(
    trpc.pushPreferences.set.mutationOptions({
      onMutate: async (next) => {
        await queryClient.cancelQueries({ queryKey: preferencesKey });
        const previous = queryClient.getQueryData<PushPreferences>(preferencesKey);
        queryClient.setQueryData(preferencesKey, next);
        return { previous };
      },
      onError: (_error, _next, context) => {
        queryClient.setQueryData(preferencesKey, context?.previous);
        showToast('error', 'Your notification settings could not be saved.');
      },
      onSuccess: (saved) => queryClient.setQueryData(preferencesKey, saved),
    }),
  );

  if (kinds.length === 0)
    return (
      <Card title="Notifications">
        <Text className="text-sm text-muted-foreground">Your role gets no notifications.</Text>
      </Card>
    );

  const muted = preferences.data?.muted;
  const toggle = (kind: PushKind, on: boolean) => {
    if (!muted) return;
    save.mutate({ muted: on ? muted.filter((other) => other !== kind) : [...muted, kind] });
  };

  return (
    <Card title="Notifications">
      {groups.map(([business, businessKinds]) => (
        <View className="gap-1" key={business}>
          <Text className="text-[11px] uppercase tracking-wider text-muted-foreground" weight="semibold">
            {BUSINESS_LABELS[business]}
          </Text>
          {businessKinds.map((kind) => (
            <View className="flex-row items-center gap-3 border-t border-border py-3" key={kind}>
              <View className="min-w-0 flex-1">
                <Text className="text-sm text-foreground" weight="semibold">
                  {PUSH_KINDS[kind].label}
                </Text>
                <Text className="text-xs text-muted-foreground">{PUSH_KINDS[kind].description}</Text>
              </View>
              <Switch
                accessibilityLabel={PUSH_KINDS[kind].label}
                disabled={!muted}
                onValueChange={(on: boolean) => toggle(kind, on)}
                value={muted ? !muted.includes(kind) : true}
              />
            </View>
          ))}
        </View>
      ))}
      {preferences.isError ? (
        <Text className="text-sm text-danger">Your notification settings could not be loaded. Pull to try again.</Text>
      ) : null}
    </Card>
  );
}
