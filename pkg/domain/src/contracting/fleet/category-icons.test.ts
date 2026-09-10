import { categoryColours, categoryIconKeys } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { statusBadgeColorClassNames } from '../../theme/status-badge.js';
import { categoryIcon, categoryIcons } from './category-icons.js';

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
  it('draws the generic machine for a key this build does not know', () => {
    expect(categoryIcon('hovercraft').key).toBe('generic-machine');
    expect(categoryIcon('tractor').key).toBe('tractor');
  });
  // Placeholders reuse a generic outline until the follow-up draws them. Drawing one means
  // removing its key here as well, so the set can only shrink.
  it('has real path data for every glyph that is not a declared placeholder', () => {
    const placeholders = new Set([
      'bakkie',
      'excavator',
      'front-end-loader',
      'generator',
      'grader',
      'lowbed',
      'pump',
      'roller',
      'tipper',
      'water-tanker',
      'disc',
      'gravel-trailer',
      'planter',
      'plough',
      'ripper',
      'slasher',
      'tip-trailer',
    ]);
    const generics = categoryIcons.filter((icon) => icon.key.startsWith('generic-')).map((icon) => icon.paths);
    for (const icon of categoryIcons) {
      if (icon.key.startsWith('generic-')) continue;
      const sharesGeneric = generics.some((paths) => paths === icon.paths);
      expect({ key: icon.key, placeholder: sharesGeneric }).toEqual({
        key: icon.key,
        placeholder: placeholders.has(icon.key),
      });
    }
  });
  it('keeps the colour palette in step with the shared badge palette', () => {
    expect([...categoryColours].sort()).toEqual(Object.keys(statusBadgeColorClassNames).sort());
  });
});
