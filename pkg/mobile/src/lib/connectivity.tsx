import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { type ReactNode, useEffect, useSyncExternalStore } from 'react';

export const offlineTitle = 'No network connection';
export const offlineMessage = 'Check your connection and try again.';

/**
 * Re-reads the device network state and pushes it into React Query's `onlineManager` —
 * the single offline signal the whole app gates on. If Expo can't report connectivity we
 * stay online so the app is never wedged behind the offline gate.
 */
export async function refreshConnectivity(): Promise<void> {
  try {
    onlineManager.setOnline(!isNetworkStateOffline(await Network.getNetworkStateAsync()));
  } catch {
    onlineManager.setOnline(true);
  }
}

/**
 * Mounts once at the app root: seeds `onlineManager` from the current network state and
 * keeps it in sync with Expo's network listener. The whole app gates on this through the
 * OfflineScreen overlay in `app/_layout.tsx`, so no screen does its own connectivity check.
 */
export function ConnectivityProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void refreshConnectivity();
    const subscription = Network.addNetworkStateListener((state) => {
      onlineManager.setOnline(!isNetworkStateOffline(state));
    });

    return () => subscription.remove();
  }, []);

  return <>{children}</>;
}

const subscribeOnline = (onStoreChange: () => void) => onlineManager.subscribe(onStoreChange);
const getIsOffline = () => !onlineManager.isOnline();

/** The single offline signal, fed by {@link ConnectivityProvider}. */
export function useIsOffline(): boolean {
  return useSyncExternalStore(subscribeOnline, getIsOffline, getIsOffline);
}

function isNetworkStateOffline(state: Network.NetworkState): boolean {
  return (
    state.type === Network.NetworkStateType.NONE || state.isConnected === false || state.isInternetReachable === false
  );
}
