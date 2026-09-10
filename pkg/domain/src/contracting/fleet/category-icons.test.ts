import { categoryColours, categoryIconKeys } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { statusBadgeColorClassNames } from '../../theme/status-badge.js';
import { categoryIcon, categoryIcons, defaultCategoryIcon } from './category-icons.js';

// SVG path data only: commands, numbers, separators. Anything else (a `fill`, a `<g>`, a colour)
// has no place in a stroke-only glyph.
const pathData = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/;
describe('category icons', () => {
  it('ships one glyph per schema key, in picker order', () => {
    expect(categoryIcons.map((icon) => icon.key)).toEqual([...categoryIconKeys]);
    expect(categoryIconKeys.slice(0, 2)).toEqual(['generic-machine', 'generic-implement']);
    const machines = categoryIconKeys.slice(2, categoryIconKeys.indexOf('disc'));
    const implements_ = categoryIconKeys.slice(categoryIconKeys.indexOf('disc'));
    for (const group of [machines, implements_]) expect([...group].sort()).toEqual([...group]);
  });
  it('holds every glyph to the stroke-only path contract', () => {
    for (const icon of categoryIcons) {
      expect(icon.key).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(icon.label.trim()).toBe(icon.label);
      expect(icon.label).not.toBe('');
      expect(icon.paths.length).toBeGreaterThan(0);
      for (const path of icon.paths) expect(path).toMatch(pathData);
    }
    expect(new Set(categoryIcons.map((icon) => icon.label)).size).toBe(categoryIcons.length);
  });
  it('defaults each kind to its generic glyph and resolves keys', () => {
    expect(categoryIcon(defaultCategoryIcon('machine')).label).toBe('Generic machine');
    expect(categoryIcon(defaultCategoryIcon('implement')).label).toBe('Generic implement');
    expect(categoryIcon('tractor').paths[0]).toMatch(/^M3 15/);
  });
  it('keeps the colour palette in step with the shared badge palette', () => {
    expect([...categoryColours].sort()).toEqual(Object.keys(statusBadgeColorClassNames).sort());
  });
});
