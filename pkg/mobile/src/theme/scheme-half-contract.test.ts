import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { listSourceFiles } from '../components/test-file-utils';

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DOMAIN_SRC = join(MOBILE_DIR, '../domain/src');

/** `textByScheme: { dark: 'text-x-200', light: 'text-x-800' }`, however it is wrapped or spaced. */
const SCHEME_HALF_LITERAL = /textByScheme:\s*\{([^}]*)\}/g;
const CLASS_LITERAL = /'([^']+)'/g;

describe('scheme half contract', () => {
  /**
   * The bug behind #1373. Native names one half of a palette directly, so that half has to be a
   * class Tailwind generated — and Tailwind emits a rule per candidate it scans, so a half that
   * only ever appears behind `dark:` has no bare rule and paints nothing. Nothing throws when that
   * happens; the chip just renders inherited foreground. This compiles the real stylesheet and
   * checks every half a surface can name against it, which is the only place that shows up.
   */
  test('generates a rule for every scheme half a surface can name', () => {
    const halves = schemeHalfClassNames();
    const stylesheet = compileStylesheet();

    expect(halves.length).toBeGreaterThan(0);
    expect(halves.filter((className) => !new RegExp(`^\\.${className} \\{`, 'm').test(stylesheet))).toEqual([]);
  });
});

/** Every class named by a `textByScheme` literal anywhere Tailwind scans for this app. */
function schemeHalfClassNames(): string[] {
  const sources = [
    ...listSourceFiles(join(MOBILE_DIR, 'app')),
    ...listSourceFiles(join(MOBILE_DIR, 'src')),
    ...listSourceFiles(DOMAIN_SRC),
  ].filter((file) => !/\.test\.tsx?$/.test(file));
  const found = sources.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(SCHEME_HALF_LITERAL)].flatMap((match) =>
      [...match[1].matchAll(CLASS_LITERAL)].map(([, className]) => className),
    ),
  );

  return [...new Set(found)];
}

function compileStylesheet(): string {
  const out = join(mkdtempSync(join(tmpdir(), 'scheme-half-')), 'compiled.css');
  execFileSync(join(MOBILE_DIR, 'node_modules/.bin/tailwindcss'), ['-i', './global.css', '-o', out], {
    cwd: MOBILE_DIR,
    stdio: 'ignore',
  });

  return readFileSync(out, 'utf8');
}
