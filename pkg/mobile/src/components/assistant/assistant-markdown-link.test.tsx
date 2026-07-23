import { createElement } from 'react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

import { AssistantMarkdownLinkContent } from './assistant-markdown-link';

describe('AssistantMarkdownLinkContent', () => {
  test('renders a pressable link when the href resolves', () => {
    const navigate = vi.fn();
    const onNavigate = vi.fn();

    const element = AssistantMarkdownLinkContent({
      children: createElement('Label', null, 'Quote Q-00001'),
      navigate,
      onNavigate,
    });

    expect(element.props.accessibilityRole).toBe('link');
    expect(element.props.onPress).toEqual(expect.any(Function));
    element.props.onPress();
    expect(onNavigate).toHaveBeenCalledWith(navigate);
  });

  test('renders plain text when the href is unsupported or unrecognized', () => {
    const element = AssistantMarkdownLinkContent({
      children: createElement('Label', null, 'Customer Example'),
      navigate: null,
      onNavigate: vi.fn(),
    });

    expect(element.props.accessibilityRole).toBeUndefined();
    expect(element.props.onPress).toBeUndefined();
  });
});
