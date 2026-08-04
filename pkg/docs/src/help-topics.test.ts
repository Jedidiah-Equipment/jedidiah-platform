import { HELP_TOPICS } from '@pkg/domain';
import { describe, expect, it } from 'vitest';
import { listContentPages } from './pages';

describe('the help-topic registry', () => {
  it('points every topic at a page this site actually has', () => {
    const existing = listContentPages();

    for (const [topic, path] of Object.entries(HELP_TOPICS)) {
      expect(existing, `help topic "${topic}" points at ${path}, which is not a page here`).toContain(path);
    }
  });
});
