import { describe, expect, it } from 'vitest';

import { getDateDisplayParts } from './DateDisplay.js';

const now = new Date(2026, 4, 19, 12, 0, 0);

describe('DateDisplay', () => {
  it('uses a today label with a medium-date tooltip for same-day past dates', () => {
    expect(getDateDisplayParts({ date: new Date(2026, 4, 19, 11, 57, 0), now })).toEqual({
      label: 'today at 11:57',
      tooltip: 'May 19th, 11:57:00',
    });
  });

  it('uses a yesterday label with a medium-date tooltip for previous-day dates', () => {
    expect(getDateDisplayParts({ date: new Date(2026, 4, 18, 14, 0, 0), now })).toEqual({
      label: 'yesterday at 14:00',
      tooltip: 'May 18th, 14:00:00',
    });
  });

  it('uses duration with a medium-date tooltip for recent dates before yesterday', () => {
    expect(getDateDisplayParts({ date: new Date(2026, 4, 17, 12, 0, 0), now })).toEqual({
      label: '2d ago',
      tooltip: 'May 17th, 12:00:00',
    });
  });

  it('uses the requested format without a tooltip for older dates', () => {
    expect(getDateDisplayParts({ date: new Date(2026, 4, 10, 14, 0, 0), format: 'medium', now })).toEqual({
      label: 'May 10th, 14:00:00',
      tooltip: null,
    });
  });

  it('uses the requested format without a tooltip for future dates', () => {
    expect(getDateDisplayParts({ date: new Date(2026, 4, 20, 12, 0, 0), now })).toEqual({
      label: 'May 20, 2026',
      tooltip: null,
    });
  });

  it('uses the requested format without a tooltip for same-day future dates', () => {
    expect(getDateDisplayParts({ date: new Date(2026, 4, 19, 12, 30, 0), now })).toEqual({
      label: 'May 19, 2026',
      tooltip: null,
    });
  });

  it('uses the empty value for missing dates', () => {
    expect(getDateDisplayParts({ date: null, emptyValue: 'No date', now })).toEqual({
      label: 'No date',
      tooltip: null,
    });
  });
});
