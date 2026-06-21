import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const offlineTitle = 'No network connection';
export const offlineMessage = 'Check your connection and try again.';
export const offlineActionMessage = `${offlineTitle}. ${offlineMessage}`;

type ConnectivityValue = {
  isKnown: boolean;
  isOffline: boolean;
  networkState: Network.NetworkState;
  refresh: () => Promise<void>;
};

const ConnectivityContext = createContext<ConnectivityValue | null>(null);

export class OfflineError extends Error {
  constructor(message = offlineActionMessage) {
    super(message);
    this.name = 'OfflineError';
  }
}

export function isOfflineError(error: unknown): error is OfflineError {
  return error instanceof OfflineError;
}

export function assertOnline(): void {
  if (isKnownOffline()) {
    throw new OfflineError();
  }
}

export function isKnownOffline(): boolean {
  return !onlineManager.isOnline();
}

export function getOfflineAwareErrorMessage(error: unknown, fallback: string): string {
  return isOfflineError(error) ? offlineActionMessage : fallback;
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [networkState, setNetworkState] = useState<Network.NetworkState>({});

  const refresh = useCallback(async () => {
    try {
      const nextState = await Network.getNetworkStateAsync();
      setNetworkState(nextState);
      onlineManager.setOnline(!isNetworkStateOffline(nextState));
    } catch {
      onlineManager.setOnline(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    Network.getNetworkStateAsync()
      .then((nextState) => {
        if (!mounted) return;
        setNetworkState(nextState);
        onlineManager.setOnline(!isNetworkStateOffline(nextState));
      })
      .catch(() => {
        // If Expo cannot report connectivity, keep React Query in its default online mode.
        onlineManager.setOnline(true);
      });

    const subscription = Network.addNetworkStateListener((nextState) => {
      setNetworkState(nextState);
      onlineManager.setOnline(!isNetworkStateOffline(nextState));
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const value = useMemo<ConnectivityValue>(() => {
    const isKnown = isNetworkStateKnown(networkState);

    return {
      isKnown,
      isOffline: isKnown ? isNetworkStateOffline(networkState) : false,
      networkState,
      refresh,
    };
  }, [networkState, refresh]);

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityValue {
  const value = useContext(ConnectivityContext);
  if (!value) {
    throw new Error('useConnectivity must be used within ConnectivityProvider.');
  }

  return value;
}

function isNetworkStateKnown(state: Network.NetworkState): boolean {
  return state.type !== undefined || state.isConnected !== undefined || state.isInternetReachable !== undefined;
}

function isNetworkStateOffline(state: Network.NetworkState): boolean {
  return (
    state.type === Network.NetworkStateType.NONE || state.isConnected === false || state.isInternetReachable === false
  );
}
