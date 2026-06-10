import { afterEach, describe, expect, it } from 'vitest';

import {
  BAY_SCHEDULE_ZOOM_DEFAULT,
  BAY_SCHEDULE_ZOOM_MAX,
  BAY_SCHEDULE_ZOOM_MIN,
  BAY_SCHEDULE_ZOOM_STEP,
  type BayScheduleViewStore,
  partializeBayScheduleViewState,
  useBayScheduleViewStore,
} from './bay-schedule-view-store.js';

describe('Bay schedule view store', () => {
  afterEach(() => {
    useBayScheduleViewStore.setState({ zoom: BAY_SCHEDULE_ZOOM_DEFAULT });
  });

  it('clamps zoom below and above the supported range', () => {
    useBayScheduleViewStore.getState().setZoom(BAY_SCHEDULE_ZOOM_MIN - BAY_SCHEDULE_ZOOM_STEP);
    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_MIN);

    useBayScheduleViewStore.getState().setZoom(BAY_SCHEDULE_ZOOM_MAX + BAY_SCHEDULE_ZOOM_STEP);
    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_MAX);
  });

  it('steps zoom in and out by 50 without crossing the bounds', () => {
    useBayScheduleViewStore.setState({ zoom: BAY_SCHEDULE_ZOOM_MIN });

    useBayScheduleViewStore.getState().zoomOut();
    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_MIN);

    useBayScheduleViewStore.getState().zoomIn();
    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_MIN + BAY_SCHEDULE_ZOOM_STEP);

    useBayScheduleViewStore.setState({ zoom: BAY_SCHEDULE_ZOOM_MAX });
    useBayScheduleViewStore.getState().zoomIn();
    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_MAX);
  });

  it('resets zoom to the default', () => {
    useBayScheduleViewStore.setState({ zoom: BAY_SCHEDULE_ZOOM_MAX });

    useBayScheduleViewStore.getState().resetZoom();

    expect(useBayScheduleViewStore.getState().zoom).toBe(BAY_SCHEDULE_ZOOM_DEFAULT);
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
