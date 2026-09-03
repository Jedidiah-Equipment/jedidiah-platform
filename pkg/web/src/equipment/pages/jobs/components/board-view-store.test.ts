import { afterEach, describe, expect, it } from 'vitest';

import {
  BOARD_ZOOM_DEFAULT,
  BOARD_ZOOM_LEVELS,
  BOARD_ZOOM_MAX,
  BOARD_ZOOM_MIN,
  type BoardViewStore,
  getNextBoardZoom,
  getPreviousBoardZoom,
  migrateBoardViewState,
  normalizeBoardZoom,
  partializeBoardViewState,
  useBoardViewStore,
} from './board-view-store.js';

describe('Board view store', () => {
  afterEach(() => {
    useBoardViewStore.setState({ zoom: BOARD_ZOOM_DEFAULT });
  });

  it('supports the final Board Gantt zoom stops', () => {
    expect(BOARD_ZOOM_LEVELS).toEqual([60, 70, 80, 90, 100, 200, 300]);
    expect(BOARD_ZOOM_MIN).toBe(60);
    expect(BOARD_ZOOM_MAX).toBe(300);
  });

  it('clamps zoom below and above the supported range', () => {
    useBoardViewStore.getState().setZoom(BOARD_ZOOM_MIN - 50);
    expect(useBoardViewStore.getState().zoom).toBe(BOARD_ZOOM_MIN);

    useBoardViewStore.getState().setZoom(BOARD_ZOOM_MAX + 50);
    expect(useBoardViewStore.getState().zoom).toBe(BOARD_ZOOM_MAX);
  });

  it('steps zoom in and out through the supported stops without crossing the bounds', () => {
    useBoardViewStore.setState({ zoom: BOARD_ZOOM_MIN });

    useBoardViewStore.getState().zoomOut();
    expect(useBoardViewStore.getState().zoom).toBe(BOARD_ZOOM_MIN);

    useBoardViewStore.getState().zoomIn();
    expect(useBoardViewStore.getState().zoom).toBe(70);

    useBoardViewStore.setState({ zoom: BOARD_ZOOM_DEFAULT });
    useBoardViewStore.getState().zoomIn();
    expect(useBoardViewStore.getState().zoom).toBe(200);

    useBoardViewStore.getState().zoomOut();
    expect(useBoardViewStore.getState().zoom).toBe(BOARD_ZOOM_DEFAULT);

    useBoardViewStore.setState({ zoom: BOARD_ZOOM_MAX });
    useBoardViewStore.getState().zoomIn();
    expect(useBoardViewStore.getState().zoom).toBe(BOARD_ZOOM_MAX);
  });

  it('clamps stepped values at the floor and ceiling', () => {
    expect(getPreviousBoardZoom(100)).toBe(90);
    expect(getPreviousBoardZoom(350)).toBe(300);
    expect(getNextBoardZoom(350)).toBe(300);
    expect(getPreviousBoardZoom(95)).toBe(90);
    expect(getNextBoardZoom(95)).toBe(100);
  });

  it('normalizes arbitrary zoom values to the nearest supported stop', () => {
    expect(normalizeBoardZoom(400)).toBe(300);
    expect(normalizeBoardZoom(350)).toBe(300);
    expect(normalizeBoardZoom(145)).toBe(100);
    expect(normalizeBoardZoom(170)).toBe(200);
    expect(normalizeBoardZoom(75)).toBe(70);
  });

  it('normalizes removed persisted zoom levels during migration', () => {
    expect(migrateBoardViewState({ zoom: 400 })).toEqual({ zoom: 300 });
    expect(migrateBoardViewState({ zoom: 120 })).toEqual({ zoom: 100 });
  });

  it('resets zoom to the default', () => {
    useBoardViewStore.setState({ zoom: BOARD_ZOOM_MAX });

    useBoardViewStore.getState().resetZoom();

    expect(BOARD_ZOOM_DEFAULT).toBe(100);
    expect(useBoardViewStore.getState().zoom).toBe(100);
  });

  it('persists only the zoom field', () => {
    const state = {
      resetZoom: () => undefined,
      setZoom: () => undefined,
      zoom: 250,
      zoomIn: () => undefined,
      zoomOut: () => undefined,
    } satisfies BoardViewStore;

    expect(partializeBoardViewState(state)).toEqual({ zoom: 250 });
  });
});
