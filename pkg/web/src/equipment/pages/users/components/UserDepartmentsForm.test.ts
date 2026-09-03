import { describe, expect, it } from 'vitest';

import { getDepartmentSelectionLabel, toggleDepartmentSelection } from './UserDepartmentsForm.js';

describe('UserDepartmentsForm', () => {
  it('summarizes selected departments in canonical order', () => {
    expect(getDepartmentSelectionLabel(['paint', 'procurement'])).toBe('Procurement, Paint');
    expect(getDepartmentSelectionLabel([])).toBe('Select departments');
  });

  it('adds and removes departments while preserving canonical order', () => {
    expect(toggleDepartmentSelection(['paint'], 'procurement', true)).toEqual(['procurement', 'paint']);
    expect(toggleDepartmentSelection(['procurement', 'paint'], 'procurement', false)).toEqual(['paint']);
  });
});
