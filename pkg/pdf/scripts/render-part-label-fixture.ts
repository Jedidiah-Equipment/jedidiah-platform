import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPartLabelsPdf } from '../src/equipment/part-label/part-label-pdf-renderer.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outputPath = path.join(REPO_ROOT, 'tmp/pdfs/part-label-fixture.pdf');
const bytes = await renderPartLabelsPdf({
  document: [
    { code: 'P-100', name: 'Main bearing', storageLocation: 'Bin A-04' },
    {
      code: 'SKF-UCF212-60',
      name: 'Hydraulic pipe - long descriptive name',
      storageLocation: 'Raw material rack, bay 4 top shelf',
    },
    { code: 'Grade 80 chain short link 20mm Apex 80', name: 'Grade 80 chain short link', storageLocation: null },
  ],
  filename: 'part-label-fixture.pdf',
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, bytes);
console.log(outputPath);
