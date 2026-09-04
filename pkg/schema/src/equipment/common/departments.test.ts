import { describe, expect, it } from 'vitest';
import { Department } from './departments.js';

describe('Department', () => {
  it('accepts supported job departments', () => {
    expect(Department.parse('procurement')).toBe('procurement');
    expect(Department.parse('fabrication')).toBe('fabrication');
    expect(Department.parse('paint')).toBe('paint');
    expect(Department.parse('assembly')).toBe('assembly');
    expect(Department.parse('workshop')).toBe('workshop');
    expect(Department.parse('supply')).toBe('supply');
  });

  it('rejects unsupported department values', () => {
    expect(() => Department.parse('engineering')).toThrow();
  });
});
