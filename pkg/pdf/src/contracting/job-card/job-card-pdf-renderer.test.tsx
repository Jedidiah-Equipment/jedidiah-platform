import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';
import { JobCardPdf } from './JobCardPdf.js';
import { jobCardFixture } from './job-card-fixture.js';
import { renderJobCardPdf } from './job-card-pdf-renderer.js';

const evidence = /travel|unaccounted|Foreman's|yard work|Thabo|northern gate|●|▲/;

describe('Job Card PDF', () => {
  test('the customer copy prints one hours figure per line, amounts and the ex-VAT total', () => {
    const text = collectText(JobCardPdf({ document: jobCardFixture('customer') })).join('\n');

    for (const expected of [
      'JOB CARD',
      'CJOB-00042',
      'Jedidiah Contracting',
      'Mr Rowley',
      'Rooikraal',
      '48.6 h',
      '44.5 h',
      'Excavator, supervised',
      'R 600.00 / h',
      'R 850.00 / Loads',
      '18 Loads',
      'R 29 160.00',
      'Lowbed move',
      'Diesel (VAT-exempt) · 210 L × R 23.00',
      'R 4 830.00',
      'Total ex VAT',
      'R 77 265.00',
    ])
      expect(text).toContain(expected);
    expect(text).toMatch(/not an invoice/);
    expect(text).not.toMatch(evidence);
  });

  test('the internal copy adds the travel split, gap reasons, evidence markers, comments and site notes', () => {
    const text = collectText(JobCardPdf({ document: jobCardFixture('internal') })).join('\n');

    for (const expected of [
      '42.4 h + 2.1 h travel',
      '+ 7.0 h unaccounted — yard work at Stony Brook',
      "Foreman's note: meter glass cracked",
      'Driver: Thabo',
      '4 002.6 h ●',
      '7 152.4 h ▲',
      'Access through the northern gate.',
    ])
      expect(text).toContain(expected);
  });

  test('splits a repeated Machine’s subtotal into work and travel on the internal copy only', () => {
    const subtotal = (variant: 'customer' | 'internal') =>
      collectText(
        JobCardPdf({
          document: {
            ...jobCardFixture(variant),
            lines: [
              {
                kind: 'subtotal',
                machineCode: 'CAT320-1',
                hours: variant === 'internal' ? { variant, work: 50.6, travel: 2 } : { variant, total: 52.6 },
                amount: 31_560,
              },
            ],
          },
        }),
      ).join('\n');

    expect(subtotal('customer')).toContain('52.6 h');
    expect(subtotal('internal')).toContain('50.6 h + 2.0 h travel');
  });

  test('prints neither Equipment’s company details nor a VAT number', () => {
    const text = collectText(JobCardPdf({ document: jobCardFixture('internal') })).join('\n');

    expect(text).not.toMatch(/Jedidiah Equipment|VAT registration/);
  });

  test('an un-priced Job prints hours only', () => {
    const document = {
      ...jobCardFixture('customer'),
      status: 'completed' as const,
      totals: null,
      lines: jobCardFixture('customer').lines.map((line) =>
        line.kind === 'stint' ? { ...line, rate: null, amount: null } : line,
      ),
    };
    const text = collectText(JobCardPdf({ document })).join('\n');

    expect(text).toContain('Not yet priced — hours only.');
    expect(text).not.toMatch(/Total ex VAT|R 29 160.00/);
  });

  test.each(['customer', 'internal'] as const)('renders the %s copy to PDF bytes', async (variant) => {
    const bytes = await renderJobCardPdf({ document: jobCardFixture(variant) });

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });
});

type RenderedElement = ReactElement<{ children?: ReactNode }>;

function collectText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!isValidElement(node)) return [];
  const element = node as RenderedElement;
  if (typeof element.type === 'function') {
    return collectText((element.type as (props: typeof element.props) => ReactNode)(element.props));
  }
  return collectText(element.props.children);
}
