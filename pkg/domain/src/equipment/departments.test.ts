import { describe, expect, it } from 'vitest';

import { departmentCrewLabels } from './departments.js';

describe('departmentCrewLabels', () => {
  it('uses the same crew-member vocabulary for every work Department', () => {
    expect(departmentCrewLabels).toEqual({
      assembly: { collection: 'Assembly crew', plural: 'Crew members', singular: 'Crew member' },
      fabrication: { collection: 'Fabrication crew', plural: 'Crew members', singular: 'Crew member' },
      paint: { collection: 'Paint crew', plural: 'Crew members', singular: 'Crew member' },
      workshop: { collection: 'Workshop crew', plural: 'Crew members', singular: 'Crew member' },
    });
  });
});
