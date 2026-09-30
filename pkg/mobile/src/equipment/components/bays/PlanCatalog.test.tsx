import { Pressable, Text as RNText } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { appVariant: 'staging' } } } }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('react-native', () => ({
  Animated: {},
  FlatList: 'FlatList',
  Image: 'Image',
  Modal: 'Modal',
  Platform: { OS: 'web', select: (options: Record<string, unknown>) => options.default },
  Pressable: 'Pressable',
  RefreshControl: 'RefreshControl',
  ScrollView: 'ScrollView',
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View',
  useWindowDimensions: () => ({ width: 400, height: 800 }),
}));
vi.mock('nativewind', () => ({ cssInterop: (component: unknown) => component, vars: (values: unknown) => values }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock('@tabler/icons-react-native', () => ({
  IconArrowsSort: () => null,
  IconBrush: () => null,
  IconCheck: () => null,
  IconChevronDown: () => null,
  IconClipboardList: () => null,
  IconHammer: () => null,
  IconSearch: () => null,
  IconTool: () => null,
  IconTools: () => null,
  IconTruckDelivery: () => null,
}));

import type { BayListCard } from '@/equipment/lib/use-bay-list';
import { PlanCatalogCard } from './PlanCatalog';

const bay = { active: null, id: 'supply-bay', name: 'Supply 1', operator: null } as BayListCard;

describe('PlanCatalogCard', () => {
  it('opens the same physical Bay after the Operator is unassigned, with the Bay promoted and the unassigned avatar preserved', async () => {
    let rendered!: ReactTestRenderer;
    await act(() => {
      rendered = create(
        <PlanCatalogCard bay={{ ...bay, operator: { name: 'Piet Pompies', thumbnailDataUrl: null } } as BayListCard} />,
      );
    });
    expect(rendered.root.findByType(Pressable).props.accessibilityLabel).toBe('Piet Pompies - Supply 1');
    await act(() => {
      rendered.update(<PlanCatalogCard bay={bay} />);
    });
    const card = rendered.root.findByType(Pressable);
    expect(card.props.accessibilityLabel).toBe('Supply 1 - No operator');
    const text = rendered.root.findAllByType(RNText).map((node) => node.props.children);
    expect(text).toContain('Supply 1 - No operator');
    expect(text).toContain('U');
    expect(text).not.toContain('Piet Pompies');
    await act(() => card.props.onPress());
    expect(push).toHaveBeenCalledWith({ pathname: '/equipment/bays/[bayId]', params: { bayId: 'supply-bay' } });
    await act(() => rendered.unmount());
  });
});
