import type { ChatRequestUsage } from '@pkg/schema';
import { create } from 'zustand';

export type LiveRunUsage = {
  contextWindow: number | null;
  request: number;
  usage: ChatRequestUsage;
};

type LiveRunUsageStore = {
  clearLiveRunUsage: () => void;
  live: LiveRunUsage | null;
  setLiveRunUsage: (live: LiveRunUsage) => void;
};

// Panel-level gauge state, not message content: the chat adapter is not a React
// component, so it writes here imperatively while the gauge subscribes.
export const useLiveRunUsageStore = create<LiveRunUsageStore>((set) => ({
  clearLiveRunUsage: () => set({ live: null }),
  live: null,
  setLiveRunUsage: (live) => set({ live }),
}));

export function useLiveRunUsage(): LiveRunUsage | null {
  return useLiveRunUsageStore((state) => state.live);
}

export function setLiveRunUsage(live: LiveRunUsage): void {
  useLiveRunUsageStore.getState().setLiveRunUsage(live);
}

export function clearLiveRunUsage(): void {
  useLiveRunUsageStore.getState().clearLiveRunUsage();
}
