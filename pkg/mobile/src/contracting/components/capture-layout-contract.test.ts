import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

test('the save action stays outside the scrolling form in an iOS keyboard-aware layout', () => {
  const source = readFileSync(join(process.cwd(), 'src/contracting/components/CaptureScreen.tsx'), 'utf8');
  const scrollEnd = source.lastIndexOf('</ScrollView>');
  const saveAction = source.indexOf("title={busy ? 'Saving…' : 'Save reading'}");

  expect(source).toContain("behavior={Platform.OS === 'ios' ? 'padding' : undefined}");
  expect(source).toContain("keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}");
  expect(saveAction).toBeGreaterThan(scrollEnd);
});
