import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { JobCardModel, JobCardVariant } from '@pkg/schema/contracting';

import { jobCardFixture } from '../src/contracting/job-card/job-card-fixture.js';
import { renderJobCardPdf } from '../src/contracting/job-card/job-card-pdf-renderer.js';

const variant = JobCardVariant.parse(process.env.JOB_CARD_VARIANT ?? 'customer');
const shape = process.env.JOB_CARD_FIXTURE ?? 'reference';
const outputDirectory = resolve(process.cwd(), '../../tmp/pdfs');
const outputPath = resolve(outputDirectory, `job-card-fixture-${variant}-${shape}.pdf`);

function fixture(): JobCardModel {
  const reference = jobCardFixture(variant);
  if (shape === 'unpriced')
    return {
      ...reference,
      status: 'completed',
      pricedAt: null,
      lines: reference.lines.map((line) => (line.kind === 'stint' ? { ...line, rate: null, amount: null } : line)),
      chargeLines: reference.chargeLines.map((line) => ({ ...line, amount: null })),
      diesel: { ...reference.diesel, unitPrice: null, amount: null },
      totals: null,
    };
  if (shape !== 'dense') return reference;
  // Ten stints on one Machine, a long Farm name and an Invoice Number: overflows onto a second page.
  const [first, ...rest] = reference.lines;
  if (first?.kind !== 'stint') throw new Error('Fixture starts with a stint');
  const repeats = Array.from({ length: 10 }, (_, index) => ({ ...first, amount: 2_940 + index }));
  return JobCardModel.parse({
    ...reference,
    status: 'invoiced',
    farmName: 'Rooikraal Noord-Oos Besproeiingsblok en Opgaardam (ou Van der Merwe-plaas)',
    invoiceNumber: 'INV-4471',
    invoicedAt: '2026-09-15T09:00:00.000Z',
    lines: [...repeats, { kind: 'subtotal', machineCode: first.machineCode, hours: 486, amount: 29_445 }, ...rest],
    discount: { label: 'Discount (5%)', amount: 3_621.75 },
    totals: { subtotal: 72_435, discount: 3_621.75, diesel: 4_830, total: 73_643.25 },
    repricingNote: variant === 'internal' ? 'Lowbed move was double-counted on the first pricing.' : null,
  });
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, await renderJobCardPdf({ document: fixture() }));
console.log(outputPath);
