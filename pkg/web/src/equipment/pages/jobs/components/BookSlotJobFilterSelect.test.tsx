import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BookSlotJobFilterSelect } from './BookSlotJobFilterSelect.js';
import type { BookSlotJobFilter } from './book-slot-jobs.js';

describe('BookSlotJobFilterSelect', () => {
  it.each([
    ['active', 'Active jobs'],
    ['all', 'All jobs'],
    ['unscheduled', 'Unscheduled jobs'],
  ] satisfies readonly [BookSlotJobFilter, string][])('shows the %s filter as "%s"', (filter, label) => {
    const html = renderToStaticMarkup(<BookSlotJobFilterSelect onValueChange={() => {}} value={filter} />);

    expect(selectValueText(html)).toBe(label);
  });
});

function selectValueText(html: string): string {
  return html.match(/data-slot="select-value"[^>]*>(.*?)<\/span>/)?.[1] ?? '';
}
