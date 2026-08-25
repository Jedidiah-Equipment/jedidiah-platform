import type { JobPickerOption } from '@pkg/schema';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Combobox } from '@/components/ui/combobox.js';
import { JobPickerOptionRow } from './JobPicker.js';
import { JobPickerTrigger } from './JobPickerTrigger.js';

/** Branded ids and dates are the schema's business; a fixture only has to read like a Job. */
type JobFixture = { [Key in keyof JobPickerOption]?: string | null };

function job(overrides: JobFixture): JobPickerOption {
  return {
    code: 'JOB-00042',
    completedOn: null,
    createdAt: '2026-08-01T08:00:00.000Z',
    customerCompanyName: 'Ridgeway Haulage',
    productName: null,
    quoteKind: 'custom',
    updatedAt: '2026-08-01T08:00:00.000Z',
    workTitle: 'Trailer deck rebuild',
    ...overrides,
  } as JobPickerOption;
}

describe('JobPickerOptionRow', () => {
  it('leads a Custom Job with the custom work icon and reads its work title under the code', () => {
    const html = renderToStaticMarkup(<JobPickerOptionRow job={job({})} />);

    expect(html).toContain('JOB-00042');
    expect(html).toContain('Trailer deck rebuild');
    expect(html).toContain('aria-label="Trailer deck rebuild"');
    expect(html).toContain('tabler-icon-tools');
  });

  it('leads a Product build with the product icon and reads its Product name under the code', () => {
    const html = renderToStaticMarkup(
      <JobPickerOptionRow job={job({ productName: 'Side Tipper', quoteKind: 'product', workTitle: null })} />,
    );

    expect(html).toContain('JOB-00042');
    expect(html).toContain('Side Tipper');
    expect(html).toContain('tabler-icon-package');
  });
});

/** The trigger is a Combobox part, so it only renders inside a root — the picker's own shape. */
const inCombobox = (trigger: React.ReactNode) => renderToStaticMarkup(<Combobox items={[]}>{trigger}</Combobox>);

describe('JobPickerTrigger', () => {
  it('reads the placeholder while no Job is chosen, and offers nothing to clear', () => {
    const html = inCombobox(<JobPickerTrigger placeholder="Filter by Job" value={null} />);

    expect(html).toContain('Filter by Job');
    expect(html).not.toContain('Clear Job');
  });

  it('names the chosen Job and offers to drop it once one is chosen', () => {
    const html = inCombobox(<JobPickerTrigger onClear={() => undefined} placeholder="Filter by Job" value={job({})} />);

    expect(html).toContain('JOB-00042');
    expect(html).toContain('Trailer deck rebuild');
    expect(html).toContain('Clear Job');
  });
});
