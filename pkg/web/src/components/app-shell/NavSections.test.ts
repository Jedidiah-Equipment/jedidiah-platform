import type { AppPermission } from '@pkg/schema';
import { IconGauge } from '@tabler/icons-react';
import { describe, expect, it } from 'vitest';

import { getVisibleNavSections, type NavSection, navAccessState } from './NavSections.js';

const sections: NavSection[] = [
  { label: '', items: [{ title: 'Home', link: { to: '/' }, icon: IconGauge }] },
  {
    label: 'Gated',
    items: [
      { title: 'Users', permission: 'user:list', link: { to: '/' }, icon: IconGauge },
      {
        title: 'Parent',
        link: { to: '/' },
        icon: IconGauge,
        children: [{ title: 'Child', permission: 'user:list', link: { to: '/' } }],
      },
    ],
  },
];

function visibleTitles(permissions: AppPermission[]) {
  const granted = new Set(permissions);
  return getVisibleNavSections(sections, (permission) => permission === undefined || granted.has(permission)).map(
    (section) => ({ label: section.label, titles: section.items.map((item) => item.title) }),
  );
}

describe('getVisibleNavSections', () => {
  it('drops a section whose every item is hidden, and a parent whose every child is hidden', () => {
    expect(visibleTitles([])).toEqual([{ label: '', titles: ['Home'] }]);
  });

  it('keeps permitted items and parents with a permitted child', () => {
    expect(visibleTitles(['user:list'])).toEqual([
      { label: '', titles: ['Home'] },
      { label: 'Gated', titles: ['Users', 'Parent'] },
    ]);
  });
});

describe('navAccessState', () => {
  it('keeps a failed access check distinct from an account with no permissions', () => {
    expect(navAccessState({ isLoadingError: false, isPending: true })).toBe('checking');
    expect(navAccessState({ isLoadingError: true, isPending: false })).toBe('unavailable');
    // Resolved, whatever it resolved to: a permission-less account is a real answer, not a failure.
    expect(navAccessState({ isLoadingError: false, isPending: false })).toBe('ready');
  });
});
