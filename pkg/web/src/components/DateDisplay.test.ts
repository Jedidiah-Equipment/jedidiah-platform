import { describe, expect, it } from 'vitest';

import { getDateDisplayParts } from './DateDisplay.js';

const now = new Date('2026-05-19T12:00:00.000Z');

describe('DateDisplay', () => {
  it('uses duration with a medium-date tooltip for dates between a week ago and now', () => {
    expect(getDateDisplayParts({ date: '2026-05-19T10:30:00.000Z', now })).toEqual({
      label: '1h 30m ago',
      tooltip: 'May 19th, 12:30:00',
    });
  });

  it('uses the requested format without a tooltip for older dates', () => {
    expect(getDateDisplayParts({ date: '2026-05-10T12:00:00.000Z', format: 'medium', now })).toEqual({
      label: 'May 10th, 14:00:00',
      tooltip: null,
    });
  });

  it('uses the requested format without a tooltip for future dates', () => {
    expect(getDateDisplayParts({ date: '2026-05-20T12:00:00.000Z', now })).toEqual({
      label: 'May 20, 2026',
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
