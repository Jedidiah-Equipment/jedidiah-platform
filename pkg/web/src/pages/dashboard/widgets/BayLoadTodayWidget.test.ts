import { describe, expect, it } from 'vitest';

import {
  BAY_LOAD_CHART_CONFIG,
  BAY_LOAD_CHART_HEIGHT_PX,
  BAY_LOAD_DEPARTMENTS,
  toBayLoadChartData,
} from './BayLoadTodayWidget.js';

describe('BayLoadTodayWidget', () => {
  it('stacks working Bays against every Bay that is not under load', () => {
    expect(toBayLoadChartData({ totalCount: 5, workingCount: 2 })).toEqual([{ notUnderLoad: 3, underLoad: 2 }]);
  });

  it('labels the radial segments by load state', () => {
    expect(BAY_LOAD_CHART_CONFIG).toMatchObject({
      notUnderLoad: { label: 'Not under load' },
      underLoad: { label: 'Under load' },
    });
  });

  it('keeps the compact top-row card focused on Fabrication and Paint', () => {
    expect([...BAY_LOAD_DEPARTMENTS]).toEqual(['fabrication', 'paint']);
    expect(BAY_LOAD_CHART_HEIGHT_PX).toBe(80);
  });
});
