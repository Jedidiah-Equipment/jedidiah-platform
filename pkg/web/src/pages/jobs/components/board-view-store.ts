import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

// Keep the old persisted key so a vocabulary-only rename does not reset saved client zoom.
export const BOARD_VIEW_PERSIST_NAME = 'bay-schedule-view';
export const BOARD_VIEW_PERSIST_VERSION = 3;
export const BOARD_ZOOM_DEFAULT = 100;
export const BOARD_ZOOM_LEVELS = [60, 70, 80, 90, 100, 200, 300] as const;
export const BOARD_ZOOM_MAX = BOARD_ZOOM_LEVELS.at(-1) ?? BOARD_ZOOM_DEFAULT;
export const BOARD_ZOOM_MIN = BOARD_ZOOM_LEVELS[0];

export type BoardViewState = {
  zoom: number;
};

export type BoardViewStore = BoardViewState & {
  resetZoom: () => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

const initialBoardViewState: BoardViewState = {
  zoom: BOARD_ZOOM_DEFAULT,
};

const testStorage: StateStorage = {
  getItem: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

export const useBoardViewStore = create<BoardViewStore>()(
  persist(
    (set) => ({
      ...initialBoardViewState,
      resetZoom: () => set({ zoom: BOARD_ZOOM_DEFAULT }),
      setZoom: (zoom) => set({ zoom: normalizeBoardZoom(zoom) }),
      zoomIn: () => set((state) => ({ zoom: getNextBoardZoom(state.zoom) })),
      zoomOut: () => set((state) => ({ zoom: getPreviousBoardZoom(state.zoom) })),
    }),
    {
      name: BOARD_VIEW_PERSIST_NAME,
      storage: createJSONStorage(getBoardViewStorage),
      migrate: (persistedState) => migrateBoardViewState(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migrateBoardViewState(persistedState),
      }),
      partialize: partializeBoardViewState,
      version: BOARD_VIEW_PERSIST_VERSION,
    },
  ),
);

export function clampBoardZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return BOARD_ZOOM_DEFAULT;
  }

  return Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, zoom));
}

export function normalizeBoardZoom(zoom: number): number {
  const clampedZoom = clampBoardZoom(zoom);

  return BOARD_ZOOM_LEVELS.reduce((closestLevel, level) => {
    const closestDistance = Math.abs(closestLevel - clampedZoom);
    const levelDistance = Math.abs(level - clampedZoom);

    if (levelDistance < closestDistance) {
      return level;
    }

    return closestLevel;
  }, BOARD_ZOOM_DEFAULT);
}

export function getNextBoardZoom(zoom: number): number {
  return BOARD_ZOOM_LEVELS.find((level) => level > zoom) ?? BOARD_ZOOM_MAX;
}

export function getPreviousBoardZoom(zoom: number): number {
  return [...BOARD_ZOOM_LEVELS].reverse().find((level) => level < zoom) ?? BOARD_ZOOM_MIN;
}

export function migrateBoardViewState(persistedState: unknown): BoardViewState {
  if (!isBoardViewState(persistedState)) {
    return initialBoardViewState;
  }

  return {
    zoom: normalizeBoardZoom(persistedState.zoom),
  };
}

export function partializeBoardViewState(state: BoardViewStore): BoardViewState {
  return {
    zoom: state.zoom,
  };
}

function isBoardViewState(value: unknown): value is BoardViewState {
  return Boolean(value && typeof value === 'object' && 'zoom' in value && typeof value.zoom === 'number');
}

function getBoardViewStorage(): StateStorage {
  return typeof localStorage === 'undefined' ? testStorage : localStorage;
}
