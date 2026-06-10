import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export const BAY_SCHEDULE_VIEW_PERSIST_NAME = 'bay-schedule-view';
export const BAY_SCHEDULE_VIEW_PERSIST_VERSION = 3;
export const BAY_SCHEDULE_ZOOM_DEFAULT = 100;
export const BAY_SCHEDULE_ZOOM_LEVELS = [60, 70, 80, 90, 100, 200, 300] as const;
export const BAY_SCHEDULE_ZOOM_MAX = BAY_SCHEDULE_ZOOM_LEVELS.at(-1) ?? BAY_SCHEDULE_ZOOM_DEFAULT;
export const BAY_SCHEDULE_ZOOM_MIN = BAY_SCHEDULE_ZOOM_LEVELS[0];

export type BayScheduleViewState = {
  zoom: number;
};

export type BayScheduleViewStore = BayScheduleViewState & {
  resetZoom: () => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const initialBayScheduleViewState: BayScheduleViewState = {
  zoom: BAY_SCHEDULE_ZOOM_DEFAULT,
};

const testStorage: StateStorage = {
  getItem: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

export const useBayScheduleViewStore = create<BayScheduleViewStore>()(
  persist(
    (set) => ({
      ...initialBayScheduleViewState,
      resetZoom: () => set({ zoom: BAY_SCHEDULE_ZOOM_DEFAULT }),
      setZoom: (zoom) => set({ zoom: normalizeBayScheduleZoom(zoom) }),
      zoomIn: () => set((state) => ({ zoom: getNextBayScheduleZoom(state.zoom) })),
      zoomOut: () => set((state) => ({ zoom: getPreviousBayScheduleZoom(state.zoom) })),
    }),
    {
      name: BAY_SCHEDULE_VIEW_PERSIST_NAME,
      storage: createJSONStorage(getBayScheduleViewStorage),
      migrate: (persistedState) => migrateBayScheduleViewState(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migrateBayScheduleViewState(persistedState),
      }),
      partialize: partializeBayScheduleViewState,
      version: BAY_SCHEDULE_VIEW_PERSIST_VERSION,
    },
  ),
);

export function clampBayScheduleZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return BAY_SCHEDULE_ZOOM_DEFAULT;
  }

  return Math.min(BAY_SCHEDULE_ZOOM_MAX, Math.max(BAY_SCHEDULE_ZOOM_MIN, zoom));
}

export function normalizeBayScheduleZoom(zoom: number): number {
  const clampedZoom = clampBayScheduleZoom(zoom);

  return BAY_SCHEDULE_ZOOM_LEVELS.reduce((closestLevel, level) => {
    const closestDistance = Math.abs(closestLevel - clampedZoom);
    const levelDistance = Math.abs(level - clampedZoom);

    if (levelDistance < closestDistance) {
      return level;
    }

    return closestLevel;
  }, BAY_SCHEDULE_ZOOM_DEFAULT);
}

export function getNextBayScheduleZoom(zoom: number): number {
  return BAY_SCHEDULE_ZOOM_LEVELS.find((level) => level > zoom) ?? BAY_SCHEDULE_ZOOM_MAX;
}

export function getPreviousBayScheduleZoom(zoom: number): number {
  return [...BAY_SCHEDULE_ZOOM_LEVELS].reverse().find((level) => level < zoom) ?? BAY_SCHEDULE_ZOOM_MIN;
}

export function migrateBayScheduleViewState(persistedState: unknown): BayScheduleViewState {
  if (!isBayScheduleViewState(persistedState)) {
    return initialBayScheduleViewState;
  }

  return {
    zoom: normalizeBayScheduleZoom(persistedState.zoom),
  };
}

export function partializeBayScheduleViewState(state: BayScheduleViewStore): BayScheduleViewState {
  return {
    zoom: state.zoom,
  };
}

function isBayScheduleViewState(value: unknown): value is BayScheduleViewState {
  return Boolean(value && typeof value === 'object' && 'zoom' in value && typeof value.zoom === 'number');
}

function getBayScheduleViewStorage(): StateStorage {
  return typeof localStorage === 'undefined' ? testStorage : localStorage;
}
