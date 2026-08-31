import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

import { SubTabControl } from './SubTabControl';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SubTabControl', () => {
  test('reports the selected tab and lets the user choose another one', () => {
    const onChange = vi.fn();
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        <SubTabControl
          activeValue="details"
          onChange={onChange}
          tabs={[
            { label: 'Details', value: 'details' },
            { label: 'Activity', value: 'activity' },
          ]}
        />,
      );
    });

    const tabs = renderer.root.findAllByProps({ accessibilityRole: 'tab' });
    expect(tabs.map((tab) => tab.props.accessibilityState)).toEqual([{ selected: true }, { selected: false }]);

    act(() => tabs[1]?.props.onPress());
    expect(onChange).toHaveBeenCalledWith('activity');
  });
});
