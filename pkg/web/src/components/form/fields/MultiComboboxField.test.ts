import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// The items are ids; Base UI searches what itemToStringLabel returns, so typing must match the labels shown.
it('searches the options by their labels', () => {
  const source = readFileSync(fileURLToPath(new URL('./MultiComboboxField.tsx', import.meta.url)), 'utf8');

  expect(source).toContain('itemToStringLabel=');
  expect(source).not.toContain('itemToStringValue=');
});
