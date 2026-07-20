import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, it } from 'vitest';

import { showTabBar, visibleTabs } from './app-tabs';

describe('visibleTabs', () => {
  it('shows only Schedule while access is unresolved', () => {
    expect(visibleTabs(undefined)).toEqual(['schedule']);
    expect(visibleTabs(null)).toEqual(['schedule']);
  });

  it('shows only Schedule to a Job Viewer', () => {
    const access = createUserAccessSummary({ role: 'job-viewer', userId: 'viewer-1' });

    expect(visibleTabs(access)).toEqual(['schedule']);
  });

  it('adds Products for a user with Product read access', () => {
    const access = createUserAccessSummary({ role: 'procurement-manager', userId: 'buyer-1' });

    expect(visibleTabs(access)).toEqual(['schedule', 'products']);
  });
});

describe('showTabBar', () => {
  it('collapses when Schedule is the only visible tab', () => {
    expect(showTabBar(['schedule'])).toBe(false);
  });

  it('renders when Products is also visible', () => {
    expect(showTabBar(['schedule', 'products'])).toBe(true);
  });
});
