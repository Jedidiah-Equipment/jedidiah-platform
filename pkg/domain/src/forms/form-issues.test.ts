import { describe, expect, it } from 'vitest';

import { getFormIssueMessages, hasFormIssuesWithin, toFormIssues } from './form-issues.js';

describe('toFormIssues', () => {
  it('addresses a nested array issue at the field name the form uses', () => {
    expect(
      toFormIssues([
        { message: 'Part can only be added once per assembly', path: ['assemblies', 6, 'parts', 3, 'partId'] },
        { message: 'Select a range', path: ['rangeId'] },
      ]),
    ).toEqual([
      { message: 'Part can only be added once per assembly', path: 'assemblies[6].parts[3].partId' },
      { message: 'Select a range', path: 'rangeId' },
    ]);
  });
});

describe('getFormIssueMessages', () => {
  it('collapses one rule breaking on several rows into a single message', () => {
    expect(
      getFormIssueMessages([
        { message: 'Part can only be added once per assembly', path: 'assemblies[6].parts[3].partId' },
        { message: 'Part can only be added once per assembly', path: 'assemblies[6].parts[0].partId' },
        { message: 'Select a part', path: 'assemblies[2].parts[0].partId' },
      ]),
    ).toEqual(['Part can only be added once per assembly', 'Select a part']);
  });
});

describe('hasFormIssuesWithin', () => {
  it('does not treat a longer sibling index as a match', () => {
    const issues = [{ message: 'Assembly name is required', path: 'assemblies[60].name' }];

    expect(hasFormIssuesWithin(issues, 'assemblies[60]')).toBe(true);
    expect(hasFormIssuesWithin(issues, 'assemblies[6]')).toBe(false);
  });
});
