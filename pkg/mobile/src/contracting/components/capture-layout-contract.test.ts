import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

test('the save action stays outside the scrolling form in an iOS keyboard-aware layout', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'CaptureScreen.tsx'), 'utf8');
  const scrollEnd = source.lastIndexOf('</ScrollView>');
  const saveAction = source.indexOf("'Save reading'");
  const errorFeedback = source.indexOf('{error ?');

  expect(source).toContain("behavior={Platform.OS === 'ios' ? 'padding' : undefined}");
  expect(source).toContain("keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}");
  expect(saveAction).toBeGreaterThan(scrollEnd);
  expect(errorFeedback).toBeGreaterThan(scrollEnd);
});
