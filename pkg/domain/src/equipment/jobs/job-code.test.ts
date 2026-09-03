import { describe, expect, it } from 'vitest';

import { parseJobCodeSearch } from './job-code.js';

describe('parseJobCodeSearch', () => {
  it('parses canonical and numeric job code searches', () => {
    expect(parseJobCodeSearch('JOB-00015')).toBe(15);
    expect(parseJobCodeSearch('job-42')).toBe(42);
    expect(parseJobCodeSearch('  7  ')).toBe(7);
  });

  it('rejects non-positive, unsafe, and non-numeric searches', () => {
    expect(parseJobCodeSearch('JOB-00000')).toBeUndefined();
    expect(parseJobCodeSearch('JOB-abc')).toBeUndefined();
    expect(parseJobCodeSearch('9007199254740992')).toBeUndefined();
  });
});
