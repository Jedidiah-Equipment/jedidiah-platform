import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = fileURLToPath(new URL('../dist/server/', import.meta.url));

function javascriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return javascriptFiles(path);
    }

    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  });
}

const invalidBundle = javascriptFiles(serverDir).find((path) =>
  readFileSync(path, 'utf8').includes('#standard-fonts/'),
);

// These imports are private to pdfkit's package scope. If one survives bundling, Node resolves it from
// the Lander chunk instead and brochure rendering crashes with MODULE_NOT_FOUND.
if (invalidBundle) {
  throw new Error(`SSR bundle contains an unresolved pdfkit standard-font import: ${invalidBundle}`);
}
