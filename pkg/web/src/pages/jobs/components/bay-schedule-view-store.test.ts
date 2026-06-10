import { afterEach, describe, expect, it } from 'vitest';

import {
  BAY_SCHEDULE_ZOOM_DEFAULT,
  BAY_SCHEDULE_ZOOM_MAX,
  BAY_SCHEDULE_ZOOM_MIN,
  BAY_SCHEDULE_ZOOM_STEP,
  type BayScheduleViewStore,
  getNextBayScheduleZoom,
  getPreviousBayScheduleZoom,
  migrateBayScheduleViewState,
  partializeBayScheduleViewState,
  useBayScheduleViewStore,
} from './bay-schedule-view-store.js';

describe('Bay schedule view store', () => {
  afterEach(() => {
    useBayScheduleViewStore.setState({ zoom: BAY_SCHEDULE_ZOOM_DEFAULT });
  });

  it('supports zoom from 70% through 300% in 50% button steps', () => {
    expect(BAY_SCHEDULE_ZOOM_MIN).toBe(70);
    expect(BAY_SCHEDULE_ZOOM_MAX).toBe(300);
    expect(BAY_SCHEDULE_ZOOM_STEP).toBe(50);
  });

  it('clamps zoom below and above the supported range', () => {
    useBayScheduleViewStore.getState().setZoom(BAY_SCHEDULE_ZOOM_MIN - 50);
    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_MIN);

    useBayScheduleViewStore.getState().setZoom(BAY_SCHEDULE_ZOOM_MAX + 50);
    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_MAX);
  });

  it('steps zoom in and out by 50% without crossing the bounds', () => {
    useBayScheduleViewStore.setState({ zoom: BAY_SCHEDULE_ZOOM_MIN });

    useBayScheduleViewStore.getState().zoomOut();
    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_MIN);

    useBayScheduleViewStore.getState().zoomIn();
    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_MIN + BAY_SCHEDULE_ZOOM_STEP);

    useBayScheduleViewStore.setState({ zoom: BAY_SCHEDULE_ZOOM_DEFAULT });
    useBayScheduleViewStore.getState().zoomIn();
    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_DEFAULT + BAY_SCHEDULE_ZOOM_STEP);

    useBayScheduleViewStore.getState().zoomOut();
    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_DEFAULT);

    useBayScheduleViewStore.setState({ zoom: BAY_SCHEDULE_ZOOM_MAX });
    useBayScheduleViewStore.getState().zoomIn();
    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_MAX);
  });

  it('clamps stepped values at the floor and ceiling', () => {
    expect(getPreviousBayScheduleZoom(100)).toBe(70);
    expect(getPreviousBayScheduleZoom(350)).toBe(300);
    expect(getNextBayScheduleZoom(350)).toBe(300);
    expect(getPreviousBayScheduleZoom(95)).toBe(70);
    expect(getNextBayScheduleZoom(95)).toBe(145);
  });

  it('clamps removed persisted zoom levels during migration', () => {
    expect(migrateBayScheduleViewState({ zoom: 400 })).toEqual({ zoom: 300 });
    expect(migrateBayScheduleViewState({ zoom: 350 })).toEqual({ zoom: 300 });
  });

  it('resets zoom to the default', () => {
    useBayScheduleViewStore.setState({ zoom: BAY_SCHEDULE_ZOOM_MAX });

    useBayScheduleViewStore.getState().resetZoom();

    expect(BAY_SCHEDULE_ZOOM_DEFAULT).toBe(100);
    expect(useBayScheduleViewStore.getState().zoom).toBe(100);
  });

  it('persists only the zoom field', () => {
    const state = {
      resetZoom: () => undefined,
      setZoom: () => undefined,
      zoom: 250,
      zoomIn: () => undefined,
      zoomOut: () => undefined,
    } satisfies BayScheduleViewStore;

    expect(partializeBayScheduleViewState(state)).toEqual({ zoom: 250 });
  });
});
