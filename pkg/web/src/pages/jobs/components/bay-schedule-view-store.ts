import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export const BAY_SCHEDULE_VIEW_PERSIST_NAME = 'bay-schedule-view';
export const BAY_SCHEDULE_VIEW_PERSIST_VERSION = 1;
export const BAY_SCHEDULE_ZOOM_DEFAULT = 200;
export const BAY_SCHEDULE_ZOOM_MAX = 400;
export const BAY_SCHEDULE_ZOOM_MIN = 100;
export const BAY_SCHEDULE_ZOOM_STEP = 50;

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
      setZoom: (zoom) => set({ zoom: clampBayScheduleZoom(zoom) }),
      zoomIn: () => set((state) => ({ zoom: clampBayScheduleZoom(state.zoom + BAY_SCHEDULE_ZOOM_STEP) })),
      zoomOut: () => set((state) => ({ zoom: clampBayScheduleZoom(state.zoom - BAY_SCHEDULE_ZOOM_STEP) })),
    }),
    {
      name: BAY_SCHEDULE_VIEW_PERSIST_NAME,
      storage: createJSONStorage(getBayScheduleViewStorage),
      migrate: () => initialBayScheduleViewState,
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

export function partializeBayScheduleViewState(state: BayScheduleViewStore): BayScheduleViewState {
  return {
    zoom: state.zoom,
  };
}

function getBayScheduleViewStorage(): StateStorage {
  return typeof localStorage === 'undefined' ? testStorage : localStorage;
}
