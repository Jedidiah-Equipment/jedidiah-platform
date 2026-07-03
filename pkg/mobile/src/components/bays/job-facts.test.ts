import { describe, expect, it } from 'vitest';

import { getJobWorkFactFields } from '@/lib/job-fact-fields';

const labels = (fields: ReturnType<typeof getJobWorkFactFields>) => fields.map((field) => field.label);

describe('getJobWorkFactFields', () => {
  it('renders the serial fact for Product Jobs', () => {
    expect(
      getJobWorkFactFields({
        workName: 'Skid Steer',
        productSerialNumber: 'SG1836260009',
      }),
    ).toEqual([
      { label: 'WORK', value: 'Skid Steer' },
      { label: 'PRODUCT SERIAL', mono: true, value: 'SG1836260009' },
    ]);
  });

  it('omits the serial fact for Custom Jobs', () => {
    expect(
      labels(
        getJobWorkFactFields({
          workName: 'Pump skid rebuild',
          productSerialNumber: null,
        }),
      ),
    ).toEqual(['WORK']);
  });
});
