import { describe, expect, it } from 'vitest';

import { getDateDisplayParts } from './date-display.js';

const now = new Date(2026, 4, 19, 12, 0, 0);

describe('getDateDisplayParts', () => {
  it('uses a today label with a medium-date tooltip for same-day past dates', () => {
    expect(getDateDisplayParts({ date: new Date(2026, 4, 19, 11, 57, 0), now })).toEqual({
      label: 'Today at 11:57',
      tooltip: '19 May 2026, 11:57',
    });
  });

  it('uses a yesterday label with a medium-date tooltip for previous-day dates', () => {
    expect(getDateDisplayParts({ date: new Date(2026, 4, 18, 14, 0, 0), now })).toEqual({
      label: 'Yesterday at 14:00',
      tooltip: '18 May 2026, 14:00',
    });
  });

  it('uses a yesterday label instead of a one-day duration bucket', () => {
    expect(
      getDateDisplayParts({
        date: new Date(2026, 4, 18, 13, 6, 0),
        now: new Date(2026, 4, 20, 10, 4, 0),
      }),
    ).toEqual({
      label: 'Yesterday at 13:06',
      tooltip: '18 May 2026, 13:06',
    });
  });

  it('uses duration with a medium-date tooltip for recent dates before yesterday', () => {
    expect(getDateDisplayParts({ date: new Date(2026, 4, 17, 12, 0, 0), now })).toEqual({
      label: '2 days ago',
      tooltip: '17 May 2026, 12:00',
    });
  });

  it('uses the requested format without a tooltip for older dates', () => {
    expect(getDateDisplayParts({ date: new Date(2026, 4, 10, 14, 0, 0), format: 'medium', now })).toEqual({
      label: '10 May 2026, 14:00',
      tooltip: null,
    });
  });

  it('uses the requested format without a tooltip for future dates', () => {
    expect(getDateDisplayParts({ date: new Date(2026, 4, 20, 12, 0, 0), now })).toEqual({
      label: '20 May 2026',
      tooltip: null,
    });
    expect(getDateDisplayParts({ date: new Date(2026, 4, 19, 12, 30, 0), now })).toEqual({
      label: '19 May 2026',
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
