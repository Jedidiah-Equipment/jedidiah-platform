import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { EQUIPMENT_MUTATION_EVENTS, mutationEventProperties } from './observability';

const MOBILE_ROOT = resolve(import.meta.dirname, '../..');

function sourceFiles(directory = MOBILE_ROOT): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx') ? [path] : [];
  });
}

describe('equipment mutation event catalog', () => {
  it('covers every tRPC mutation called by the mobile app', () => {
    const procedures = new Set<string>();
    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/trpc\.([A-Za-z0-9_]+\.[A-Za-z0-9_]+)\.mutationOptions/g)) {
        procedures.add(match[1]);
      }
    }

    expect(Object.keys(EQUIPMENT_MUTATION_EVENTS).sort()).toEqual([...procedures].sort());
  });

  it('keeps sensitive mutation fields out of event properties', () => {
    const properties = mutationEventProperties('quotes.cancel', {
      id: 'quote-1',
      cancellationReason: 'private customer context',
    });

    expect(properties).toEqual({ quoteId: 'quote-1' });
    expect(JSON.stringify(properties)).not.toContain('private customer context');
  });
});
